--!strict
-- Card inventory rules: give, place on base, take back, sell, auto-arrange.
-- Everything is validated on the server; the client only sends requests.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local BaseService = require(script.Parent.BaseService)
local RateLimiter = require(script.Parent.RateLimiter)

local CardService = {}

local function changed(session: DataService.Session, placedChanged: boolean)
	DataService.touch(session)
	if placedChanged then
		BaseService.refresh(session.player)
	end
	Replication.queue(session.player)
end

local function isInt(v: any, min: number, max: number): boolean
	return type(v) == "number" and v == math.floor(v) and v >= min and v <= max
end

function CardService.give(session: DataService.Session, cardId: string, amount: number)
	if not Cards.byId[cardId] then
		return
	end
	local inv = session.profile.inv
	inv[cardId] = math.min(1e6, (inv[cardId] or 0) + amount)
	session.profile.stats.cards += amount
	changed(session, false)
end

function CardService.place(player: Player, cardId: any, slot: any)
	if type(cardId) ~= "string" or not Cards.byId[cardId] then
		return
	end
	local session = DataService.get(player)
	if not session then
		return
	end
	local profile = session.profile
	if (profile.inv[cardId] or 0) < 1 then
		Replication.notify(player, "text", "You do not have this card.", "bad")
		return
	end
	local total = Economy.totalSlots(session)
	local target: number? = nil
	if slot ~= nil then
		if not isInt(slot, 1, total) then
			return
		end
		target = slot :: number
	else
		for i = 1, total do
			if not profile.placed[tostring(i)] then
				target = i
				break
			end
		end
		if not target then
			Replication.notify(player, "text", "Your base is full. Take a card back, or buy a slot.", "bad")
			return
		end
	end
	local key = tostring(target)
	local old = profile.placed[key]
	local left = (profile.inv[cardId] or 0) - 1
	if left > 0 then
		profile.inv[cardId] = left
	else
		profile.inv[cardId] = nil
	end
	if old then
		profile.inv[old] = (profile.inv[old] or 0) + 1
	end
	profile.placed[key] = cardId
	changed(session, true)
end

function CardService.remove(player: Player, slot: any)
	local session = DataService.get(player)
	if not session or not isInt(slot, 1, 100) then
		return
	end
	local key = tostring(slot)
	local cardId = session.profile.placed[key]
	if not cardId then
		return
	end
	session.profile.placed[key] = nil
	session.profile.inv[cardId] = (session.profile.inv[cardId] or 0) + 1
	changed(session, true)
end

function CardService.sell(player: Player, cardId: any, amount: any)
	if type(cardId) ~= "string" or not Cards.byId[cardId] then
		return
	end
	local session = DataService.get(player)
	if not session then
		return
	end
	local have = session.profile.inv[cardId] or 0
	local n: number
	if amount == "all" then
		n = have
	elseif isInt(amount, 1, 1e6) then
		n = math.min(have, amount :: number)
	else
		return
	end
	if n < 1 then
		return
	end
	local left = have - n
	if left > 0 then
		session.profile.inv[cardId] = left
	else
		session.profile.inv[cardId] = nil
	end
	local gained = Cards.sellValue(cardId) * n
	Economy.addMoney(session, gained)
	Replication.notify(player, "text", string.format("Sold %dx %s for %s", n, Cards.byId[cardId].name, Format.money(gained)), "good")
	changed(session, false)
end

function CardService.sellGrade(player: Player, grade: any)
	if not Grades.isGrade(grade) then
		return
	end
	local session = DataService.get(player)
	if not session then
		return
	end
	local gained, count = 0, 0
	for id, n in session.profile.inv do
		local def = Cards.byId[id]
		if def and def.grade == grade then
			gained += Cards.sellValue(id) * n
			count += n
			session.profile.inv[id] = nil
		end
	end
	if count == 0 then
		return
	end
	Economy.addMoney(session, gained)
	Replication.notify(player, "text", string.format("Sold %d %s cards for %s", count, grade :: string, Format.money(gained)), "good")
	changed(session, false)
end

-- Rearranges everything so the best cards (by income) sit on the available slots.
function CardService.autoBest(player: Player)
	local session = DataService.get(player)
	if not session then
		return
	end
	local profile = session.profile
	local pool: { string } = {}
	for _, id in profile.placed do
		table.insert(pool, id)
	end
	for id, n in profile.inv do
		for _ = 1, math.min(n, 100) do
			table.insert(pool, id)
		end
		-- (counts beyond 100 stay in the inventory below)
	end
	table.sort(pool, function(a, b)
		local ia, ib = Cards.byId[a].income, Cards.byId[b].income
		if ia ~= ib then
			return ia > ib
		end
		return a < b
	end)
	local total = Economy.totalSlots(session)
	local newPlaced: { [string]: string } = {}
	local newInv: { [string]: number } = {}
	-- inventory counts above 100 per card are kept as they were
	for id, n in profile.inv do
		if n > 100 then
			newInv[id] = n - 100
		end
	end
	for i, id in pool do
		if i <= total then
			newPlaced[tostring(i)] = id
		else
			newInv[id] = (newInv[id] or 0) + 1
		end
	end
	profile.placed = newPlaced
	profile.inv = newInv
	changed(session, true)
end

function CardService.init()
	BaseService.takeHandler = function(player, slot)
		CardService.remove(player, slot)
	end
	Remotes.get("PlaceCard").OnServerEvent:Connect(function(player, cardId: any, slot: any)
		if RateLimiter.allow(player, "card", 0.1) then
			CardService.place(player, cardId, slot)
		end
	end)
	Remotes.get("RemoveCard").OnServerEvent:Connect(function(player, slot: any)
		if RateLimiter.allow(player, "card", 0.1) then
			CardService.remove(player, slot)
		end
	end)
	Remotes.get("Sell").OnServerEvent:Connect(function(player, cardId: any, amount: any)
		if RateLimiter.allow(player, "sell", 0.1) then
			CardService.sell(player, cardId, amount)
		end
	end)
	Remotes.get("SellGrade").OnServerEvent:Connect(function(player, grade: any)
		if RateLimiter.allow(player, "sell", 0.3) then
			CardService.sellGrade(player, grade)
		end
	end)
	Remotes.get("AutoBest").OnServerEvent:Connect(function(player)
		if RateLimiter.allow(player, "autobest", 0.7) then
			CardService.autoBest(player)
		end
	end)
end

return CardService
