--!strict
-- Upgrades and travel: damage upgrade, base slots, unlocking worlds, teleports, and the gate guard.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local BaseService = require(script.Parent.BaseService)
local RateLimiter = require(script.Parent.RateLimiter)
local World = require(script.Parent.World)

local ProgressService = {}

local function rootOf(player: Player): BasePart?
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if hrp and hrp:IsA("BasePart") then
		return hrp
	end
	return nil
end

function ProgressService.buyDamage(player: Player, amount: any)
	local session = DataService.get(player)
	if not session then
		return
	end
	local profile = session.profile
	local level = profile.damageLevel
	local count = 0
	local cost = 0
	if amount == "max" then
		count, cost = Formulas.maxAffordable(level, profile.money)
	elseif amount == 1 or amount == 10 or amount == 100 then
		count = math.min(amount :: number, Config.MAX_DAMAGE_LEVEL - level)
		cost = Formulas.damageCostMany(level, count)
	else
		return
	end
	if count < 1 then
		Replication.notify(player, "text", level >= Config.MAX_DAMAGE_LEVEL and "Damage is at the maximum." or "Not enough money.", "bad")
		return
	end
	if not Economy.spend(session, cost) then
		Replication.notify(player, "text", "Not enough money.", "bad")
		return
	end
	profile.damageLevel = level + count
	Replication.queue(player)
end

function ProgressService.buySlot(player: Player)
	local session = DataService.get(player)
	if not session then
		return
	end
	local cost = Formulas.slotCost(session.profile.slots)
	if not cost then
		Replication.notify(player, "text", "You already bought every slot.", "bad")
		return
	end
	if not Economy.spend(session, cost) then
		Replication.notify(player, "text", "Not enough money (" .. Format.money(cost) .. ").", "bad")
		return
	end
	session.profile.slots += 1
	BaseService.refresh(player)
	Replication.queue(player)
end

function ProgressService.buyZone(player: Player, zoneId: any)
	if type(zoneId) ~= "number" or zoneId ~= math.floor(zoneId) then
		return
	end
	local session = DataService.get(player)
	local zone = Zones.get(zoneId)
	if not session or not zone then
		return
	end
	if zoneId <= session.profile.zonesUnlocked then
		Replication.notify(player, "text", "Already unlocked.", "bad")
		return
	end
	if zoneId ~= session.profile.zonesUnlocked + 1 then
		Replication.notify(player, "text", "Unlock the previous world first.", "bad")
		return
	end
	if not Economy.spend(session, zone.gateCost) then
		Replication.notify(player, "text", "Not enough money (" .. Format.money(zone.gateCost) .. ").", "bad")
		return
	end
	session.profile.zonesUnlocked = zoneId
	Replication.notify(player, "text", zone.name .. " unlocked!", "good")
	Replication.queue(player)
	task.spawn(DataService.saveNow, session) -- important progress: save right away
end

function ProgressService.teleport(player: Player, where: any)
	local session = DataService.get(player)
	local hrp = rootOf(player)
	if not session or not hrp then
		return
	end
	if where == "base" then
		if not BaseService.teleportHome(player) then
			Replication.notify(player, "text", "Your base is not ready yet.", "bad")
		end
	elseif where == "hub" then
		hrp.CFrame = CFrame.new(World.hubSpawn)
	elseif type(where) == "number" and Zones.get(where) and where == math.floor(where) then
		if where > session.profile.zonesUnlocked then
			Replication.notify(player, "text", "This world is locked.", "bad")
			return
		end
		hrp.CFrame = CFrame.new(Zones.spawnPosition(where))
	end
end

-- Server-side gate guard: nobody stays in a world they have not unlocked (walls are only client-side per player).
local function guardLoop()
	while true do
		task.wait(1)
		for player, session in DataService.all() do
			local hrp = rootOf(player)
			if hrp and not session.released then
				local pos = hrp.Position
				local zoneId = Zones.zoneAtZ(pos.Z)
				if zoneId and zoneId > session.profile.zonesUnlocked and math.abs(pos.X) < 140 then
					hrp.CFrame = CFrame.new(Zones.spawnPosition(session.profile.zonesUnlocked))
					Replication.notify(player, "text", "That world is locked. Unlock the gate first.", "bad")
				end
			end
		end
	end
end

function ProgressService.init()
	BaseService.buyHandler = function(player)
		ProgressService.buySlot(player)
	end
	for zoneId, prompt in World.gatePrompts do
		prompt.Triggered:Connect(function(player: Player)
			if RateLimiter.allow(player, "zone", 0.5) then
				ProgressService.buyZone(player, zoneId)
			end
		end)
	end
	Remotes.get("BuyDamage").OnServerEvent:Connect(function(player, amount: any)
		if RateLimiter.allow(player, "buy", 0.1) then
			ProgressService.buyDamage(player, amount)
		end
	end)
	Remotes.get("BuySlot").OnServerEvent:Connect(function(player)
		if RateLimiter.allow(player, "buy", 0.3) then
			ProgressService.buySlot(player)
		end
	end)
	Remotes.get("BuyZone").OnServerEvent:Connect(function(player, zoneId: any)
		if RateLimiter.allow(player, "zone", 0.5) then
			ProgressService.buyZone(player, zoneId)
		end
	end)
	Remotes.get("TeleportTo").OnServerEvent:Connect(function(player, where: any)
		if RateLimiter.allow(player, "tp", 1.5) then
			ProgressService.teleport(player, where)
		end
	end)
	task.spawn(guardLoop)
end

return ProgressService
