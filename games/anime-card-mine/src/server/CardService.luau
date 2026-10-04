--!strict
-- Card rules: give, place on base, equip in the sword, take back, level up, sell, auto-arrange.
-- Everything is validated on the server; the client only sends requests.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local BaseService = require(script.Parent.BaseService)
local MonetizationService = require(script.Parent.MonetizationService)
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

local function setCount(t: { [string]: number }, key: string, n: number)
	if n > 0 then
		t[key] = n
	else
		t[key] = nil
	end
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

-- Puts a card from the inventory into a slot of `container` ("placed" = base, "sword" = sword).
-- slot == nil -> first free slot. An occupied slot is swapped.
local function putCard(player: Player, container: string, cardId: any, slot: any)
	if type(cardId) ~= "string" or not Cards.byId[cardId] then
		return
	end
	local session = DataService.get(player)
	if not session then
		return
	end
	local profile = session.profile
	local slots = if container == "sword" then Economy.swordSlots(session) else Economy.baseSlots(session)
	local target: { [string]: string } = if container == "sword" then profile.sword else profile.placed
	if (profile.inv[cardId] or 0) < 1 then
		Replication.notify(player, "text", "You do not have this card.", "bad")
		return
	end
	local index: number? = nil
	if slot ~= nil then
		if not isInt(slot, 1, slots) then
			return
		end
		index = slot :: number
	else
		for i = 1, slots do
			if not target[tostring(i)] then
				index = i
				break
			end
		end
		if not index then
			Replication.notify(player, "text", if container == "sword" then "Sword slots are full. Take a card out first." else "Your base is full. Take a card back, or buy a slot.", "bad")
			return
		end
	end
	local key = tostring(index)
	local old = target[key]
	setCount(profile.inv, cardId, (profile.inv[cardId] or 0) - 1)
	if old then
		profile.inv[old] = (profile.inv[old] or 0) + 1
	end
	target[key] = cardId
	changed(session, container == "placed")
end

local function takeCard(player: Player, container: string, slot: any)
	local session = DataService.get(player)
	if not session or not isInt(slot, 1, 100) then
		return
	end
	local target: { [string]: string } = if container == "sword" then session.profile.sword else session.profile.placed
	local key = tostring(slot)
	local cardId = target[key]
	if not cardId then
		return
	end
	target[key] = nil
	session.profile.inv[cardId] = (session.profile.inv[cardId] or 0) + 1
	changed(session, container == "placed")
end

function CardService.place(player: Player, cardId: any, slot: any)
	putCard(player, "placed", cardId, slot)
end

function CardService.remove(player: Player, slot: any)
	takeCard(player, "placed", slot)
end

function CardService.equip(player: Player, cardId: any, slot: any)
	putCard(player, "sword", cardId, slot)
end

function CardService.unequip(player: Player, slot: any)
	takeCard(player, "sword", slot)
end

-- Feeds duplicate copies from the inventory into the character: level up.
function CardService.levelUp(player: Player, cardId: any)
	if type(cardId) ~= "string" or not Cards.byId[cardId] then
		return
	end
	local session = DataService.get(player)
	if not session then
		return
	end
	local profile = session.profile
	local level = profile.levels[cardId] or 1
	if level >= Config.CARD_MAX_LEVEL then
		Replication.notify(player, "text", "This card is at the maximum level.", "bad")
		return
	end
	local need = Cards.copiesToLevel(level)
	local have = profile.inv[cardId] or 0
	if have < need then
		Replication.notify(player, "text", string.format("Need %d spare copies (you have %d).", need, have), "bad")
		return
	end
	setCount(profile.inv, cardId, have - need)
	profile.levels[cardId] = level + 1
	Replication.notify(player, "text", Cards.byId[cardId].name .. " is now level " .. (level + 1) .. "!", "good")
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
	setCount(session.profile.inv, cardId, have - n)
	local gained = Cards.sellValue(cardId) * n
	Economy.addMoney(session, gained)
	Replication.notify(player, "text", string.format("Sold %dx %s for %s", n, Cards.byId[cardId].name, Format.money(gained)), "good")
	changed(session, false)
end

function CardService.sellGrade(player: Player, grade: any)
	if type(grade) ~= "string" or not Grades.info[grade] then
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
	Replication.notify(player, "text", string.format("Sold %d %s cards for %s", count, grade, Format.money(gained)), "good")
	changed(session, false)
end

-- Rearranges the BASE so the best cards (by income) sit on the available slots.
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
	local keep: { [string]: number } = {}
	for id, n in profile.inv do
		local take = math.min(n, 100)
		for _ = 1, take do
			table.insert(pool, id)
		end
		if n > take then
			keep[id] = n - take -- huge stacks: the rest stays in the inventory
		end
	end
	table.sort(pool, function(a, b)
		local ia = Cards.byId[a].income * Cards.levelIncomeMult(profile.levels[a] or 1)
		local ib = Cards.byId[b].income * Cards.levelIncomeMult(profile.levels[b] or 1)
		if ia ~= ib then
			return ia > ib
		end
		return a < b
	end)
	local total = Economy.baseSlots(session)
	local newPlaced: { [string]: string } = {}
	for i, id in pool do
		if i <= total then
			newPlaced[tostring(i)] = id
		else
			keep[id] = (keep[id] or 0) + 1
		end
	end
	profile.placed = newPlaced
	profile.inv = keep
	changed(session, true)
end

function CardService.init()
	BaseService.takeHandler = function(player, slot)
		CardService.remove(player, slot)
	end
	MonetizationService.hooks.giveCard = CardService.give

	local function bind(name: string, interval: number, key: string, fn: (Player, any, any) -> ())
		Remotes.get(name).OnServerEvent:Connect(function(player: Player, a: any, b: any)
			if RateLimiter.allow(player, key, interval) then
				fn(player, a, b)
			end
		end)
	end
	bind("PlaceCard", 0.1, "card", CardService.place)
	bind("RemoveCard", 0.1, "card", CardService.remove)
	bind("EquipCard", 0.1, "card", CardService.equip)
	bind("UnequipCard", 0.1, "card", CardService.unequip)
	bind("LevelUp", 0.15, "card", CardService.levelUp)
	bind("Sell", 0.1, "sell", CardService.sell)
	bind("SellGrade", 0.3, "sell", CardService.sellGrade)
	bind("AutoBest", 0.7, "autobest", function(player)
		CardService.autoBest(player)
	end)
end

return CardService
