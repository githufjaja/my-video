--!strict
-- Player data: load / autosave / save on leave / BindToClose, with a simple session lock.
-- Stored value shape: { data = Profile, lock = { job = JobId, t = os.time() } | nil }
-- Rules:
--  * every DataStore call is in pcall;
--  * a server only overwrites data if it holds the lock (or the lock is stale);
--  * if loading fails on a live server the player is kicked (nothing gets overwritten);
--  * in Studio without API access the game runs in "offline" mode (progress is NOT saved).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Types = require(ReplicatedStorage.Shared.Types)

export type Session = {
	player: Player,
	profile: Types.Profile,
	offline: boolean, -- true: not saved
	dirty: boolean,
	lastSave: number,
	released: boolean, -- true once the final save started
	saving: boolean,
}

local DataService = {}

local storeOk, storeOrErr = pcall(function()
	return DataStoreService:GetDataStore(Config.DATASTORE_NAME)
end)
local store: DataStore? = if storeOk then storeOrErr :: DataStore else nil
if not storeOk then
	warn("[DataService] DataStore unavailable:", storeOrErr)
end
local sessions: { [Player]: Session } = {}
local loadedCallbacks: { (Session) -> () } = {}
local leavingCallbacks: { (Session) -> () } = {}
local activeSaves = 0

local function keyFor(player: Player): string
	return "Player_" .. tostring(player.UserId)
end

local function defaultProfile(): Types.Profile
	return {
		v = 1,
		money = 0,
		damageLevel = 0,
		slots = Config.START_SLOTS,
		zonesUnlocked = 1,
		inv = {},
		placed = {},
		stats = { rocks = 0, cards = 0 },
		receipts = {},
	}
end

local function num(v: any, default: number, min: number, max: number): number
	if type(v) ~= "number" or v ~= v then
		return default
	end
	return math.clamp(v, min, max)
end

-- Fix anything strange in loaded data (old versions, manual edits, corruption).
local function sanitize(raw: any): Types.Profile
	local p = defaultProfile()
	if type(raw) ~= "table" then
		return p
	end
	p.money = num(raw.money, 0, 0, Config.MAX_MONEY)
	p.damageLevel = math.floor(num(raw.damageLevel, 0, 0, Config.MAX_DAMAGE_LEVEL))
	p.slots = math.floor(num(raw.slots, Config.START_SLOTS, Config.START_SLOTS, Config.START_SLOTS + #Config.SLOT_COSTS))
	p.zonesUnlocked = math.floor(num(raw.zonesUnlocked, 1, 1, #Zones.list))
	if type(raw.inv) == "table" then
		for id, count in raw.inv do
			if type(id) == "string" and Cards.byId[id] and type(count) == "number" and count >= 1 then
				p.inv[id] = math.floor(math.min(count, 1e6))
			end
		end
	end
	if type(raw.placed) == "table" then
		local used: { [string]: boolean } = {}
		for slotKey, id in raw.placed do
			local slot = tonumber(slotKey)
			if slot and slot >= 1 and slot <= Config.PLOT_MAX_SLOTS and slot == math.floor(slot) and type(id) == "string" and Cards.byId[id] and not used[tostring(slot)] then
				used[tostring(slot)] = true
				p.placed[tostring(slot)] = id
			end
		end
	end
	if type(raw.stats) == "table" then
		p.stats.rocks = math.floor(num(raw.stats.rocks, 0, 0, 1e12))
		p.stats.cards = math.floor(num(raw.stats.cards, 0, 0, 1e12))
	end
	if type(raw.receipts) == "table" then
		local n = 0
		for id, v in raw.receipts do
			if type(id) == "string" and v == true and n < 100 then
				p.receipts[id] = true
				n += 1
			end
		end
	end
	return p
end

local function lockedByOther(old: any): boolean
	local lock = old and old.lock
	return type(lock) == "table" and lock.job ~= game.JobId and (os.time() - (tonumber(lock.t) or 0)) < Config.LOCK_TIMEOUT
end

-- returns profile, status ("ok" | "locked" | "error")
local function fetch(player: Player): (Types.Profile?, string, string?)
	local found: any = nil
	local status = "error"
	local activeStore = store
	if not activeStore then
		return nil, "error", "DataStore service unavailable"
	end
	local ok, err = pcall(function()
		activeStore:UpdateAsync(keyFor(player), function(old: any): any
			if lockedByOther(old) then
				status = "locked"
				return nil -- cancel: another server owns this player right now
			end
			local value: any = old
			if type(value) ~= "table" then
				value = {}
			end
			value.lock = { job = game.JobId, t = os.time() }
			found = value.data
			status = "ok"
			return value
		end)
	end)
	if not ok then
		return nil, "error", tostring(err)
	end
	if status == "locked" then
		return nil, "locked", nil
	end
	return sanitize(found), "ok", nil
end

local function loadPlayer(player: Player)
	local profile: Types.Profile? = nil
	local offline = false
	local lastError: string? = nil
	local status = "error"

	for attempt = 1, Config.LOAD_RETRIES do
		if not player.Parent then
			return
		end
		profile, status, lastError = fetch(player)
		if profile then
			break
		end
		if RunService:IsStudio() and status == "error" then
			break -- Studio without API access: no point retrying
		end
		if attempt < Config.LOAD_RETRIES then
			task.wait(2 * attempt)
		end
	end

	if not player.Parent then
		-- left while loading: release the lock we may have taken
		local activeStore = store
		if profile and activeStore then
			pcall(function()
				activeStore:UpdateAsync(keyFor(player), function(old: any): any
					if type(old) == "table" and old.lock and old.lock.job == game.JobId then
						old.lock = nil
						return old
					end
					return nil
				end)
			end)
		end
		return
	end

	if not profile then
		if RunService:IsStudio() and status == "error" then
			warn(
				"[DataService] DataStore unavailable ("
					.. tostring(lastError)
					.. "). OFFLINE mode: progress will NOT be saved. "
					.. "Publish the place and enable Game Settings > Security > Enable Studio Access to API Services."
			)
			profile = defaultProfile()
			offline = true
		else
			warn("[DataService] could not load data for", player.Name, status, lastError)
			player:Kick(
				status == "locked" and "Your data is still being saved by another server. Please rejoin in a minute."
					or "Could not load your data. Please rejoin; your progress is safe."
			)
			return
		end
	end

	local session: Session = {
		player = player,
		profile = profile :: Types.Profile,
		offline = offline,
		dirty = false,
		lastSave = os.clock(),
		released = false,
		saving = false,
	}
	sessions[player] = session
	for _, cb in loadedCallbacks do
		task.spawn(cb, session)
	end
end

-- Writes the profile. release = true removes our lock (player is leaving).
local function writeSession(session: Session, release: boolean): boolean
	if session.offline then
		return true
	end
	local profile = session.profile
	local conflict = false
	local activeStore = store
	if not activeStore then
		return false
	end
	local ok, err = pcall(function()
		activeStore:UpdateAsync(keyFor(session.player), function(old: any): any
			if lockedByOther(old) then
				conflict = true
				return nil
			end
			return {
				data = profile,
				lock = if release then nil else { job = game.JobId, t = os.time() },
			}
		end)
	end)
	if not ok then
		warn("[DataService] save failed", session.player.Name, err)
		return false
	end
	if conflict then
		warn("[DataService] save skipped: data is locked by another server", session.player.Name)
		return false
	end
	return true
end

-- Public: save right now (used by autosave and purchases). Returns true on success.
function DataService.saveNow(session: Session): boolean
	if session.saving or session.released then
		return false
	end
	session.saving = true
	activeSaves += 1
	local ok = writeSession(session, false)
	activeSaves -= 1
	session.saving = false
	if ok then
		session.dirty = false
		session.lastSave = os.clock()
	end
	return ok
end

local function releasePlayer(player: Player)
	local session = sessions[player]
	if not session or session.released then
		return
	end
	session.released = true
	for _, cb in leavingCallbacks do
		local cbOk, cbErr = pcall(function(): any?
			cb(session)
			return nil
		end)
		if not cbOk then
			warn("[DataService] leaving callback error", cbErr)
		end
	end
	activeSaves += 1
	local ok = false
	for attempt = 1, 3 do
		ok = writeSession(session, true)
		if ok then
			break
		end
		task.wait(1.5 * attempt)
	end
	activeSaves -= 1
	if not ok then
		warn("[DataService] DATA NOT SAVED for", player.Name)
	end
	sessions[player] = nil
end

function DataService.get(player: Player): Session?
	local s = sessions[player]
	if s and not s.released then
		return s
	end
	return nil
end

function DataService.all(): { [Player]: Session }
	return sessions
end

function DataService.touch(session: Session)
	session.dirty = true
end

function DataService.onLoaded(cb: (Session) -> ())
	table.insert(loadedCallbacks, cb)
end

function DataService.onLeaving(cb: (Session) -> ())
	table.insert(leavingCallbacks, cb)
end

function DataService.start()
	Players.PlayerAdded:Connect(function(player)
		task.spawn(loadPlayer, player)
	end)
	for _, player in Players:GetPlayers() do
		task.spawn(loadPlayer, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		task.spawn(releasePlayer, player)
	end)

	-- autosave: dirty profiles, plus a periodic lock refresh for idle players
	task.spawn(function()
		while true do
			task.wait(Config.AUTOSAVE_SECONDS)
			for _, session in sessions do
				if not session.released and not session.offline and (session.dirty or os.clock() - session.lastSave > 240) then
					task.spawn(DataService.saveNow, session)
					task.wait(0.4) -- spread requests (DataStore budget)
				end
			end
		end
	end)

	game:BindToClose(function()
		for player in sessions do
			task.spawn(releasePlayer, player)
		end
		local t0 = os.clock()
		while activeSaves > 0 and os.clock() - t0 < 25 do
			task.wait(0.1)
		end
	end)
end

return DataService
