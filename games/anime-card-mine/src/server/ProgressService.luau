--!strict
-- Upgrades and travel: sword level, base slots, sword slots, rebirth, teleports, and the wall guard.
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
		Replication.notify(player, "text", level >= Config.MAX_DAMAGE_LEVEL and "Sword level is at the maximum." or "Not enough money.", "bad")
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
		Replication.notify(player, "text", "You already bought every base slot.", "bad")
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

function ProgressService.buySwordSlot(player: Player)
	local session = DataService.get(player)
	if not session then
		return
	end
	local cost = Formulas.swordSlotCost(session.profile.swordSlots)
	if not cost then
		Replication.notify(player, "text", "No more sword slots to buy.", "bad")
		return
	end
	if not Economy.spend(session, cost) then
		Replication.notify(player, "text", "Not enough money (" .. Format.money(cost) .. ").", "bad")
		return
	end
	session.profile.swordSlots += 1
	Replication.queue(player)
end

-- Rebirth: resets money, sword level and stage progress; cards, levels, slots and purchases stay.
function ProgressService.rebirth(player: Player)
	local session = DataService.get(player)
	if not session then
		return
	end
	local profile = session.profile
	if profile.rebirths >= Config.REBIRTH_MAX then
		Replication.notify(player, "text", "Maximum rebirths reached.", "bad")
		return
	end
	local need = Formulas.rebirthStageReq(profile.rebirths)
	if profile.stage < need then
		Replication.notify(player, "text", string.format("Clear %d stages first (you cleared %d).", need, profile.stage), "bad")
		return
	end
	profile.rebirths += 1
	profile.money = 0
	profile.damageLevel = 0
	profile.stage = 0
	session.wallStage = 0
	session.wallHp = 0
	player:SetAttribute("WallStage", 0)
	player:SetAttribute("WallHp", 0)
	DataService.touch(session)
	local hrp = rootOf(player)
	if hrp then
		hrp.CFrame = CFrame.new(World.hubSpawn)
	end
	Replication.notify(player, "text", string.format("REBIRTH %d! Damage x%.2f, money x%.2f", profile.rebirths, Formulas.rebirthDamageMult(profile.rebirths), Formulas.rebirthMoneyMult(profile.rebirths)), "good")
	Replication.queue(player)
	task.spawn(DataService.saveNow, session)
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
	elseif type(where) == "number" and where == math.floor(where) and Zones.getWorld(where) then
		local world = Zones.worlds[where]
		if not Zones.isWorldUnlocked(world.id, session.profile.stage) then
			Replication.notify(player, "text", "Complete World " .. (world.id - 1) .. " first.", "bad")
			return
		end
		local target = math.clamp(session.profile.stage + 1, world.firstStage, world.lastStage)
		hrp.CFrame = CFrame.new(Zones.spawnPosition(target))
	end
end

-- Server-side guard: nobody stays beyond a wall they have not broken (walls are only switched off per player on the client).
local function guardLoop()
	while true do
		task.wait(1)
		for player, session in DataService.all() do
			local hrp = rootOf(player)
			if hrp and not session.released then
				local pos = hrp.Position
				local stageId = Zones.stageAtZ(pos.Z)
				if stageId and stageId > session.profile.stage + 1 and math.abs(pos.X) < 140 then
					hrp.CFrame = CFrame.new(Zones.spawnPosition(session.profile.stage + 1))
					Replication.notify(player, "text", "Break the wall first!", "bad")
				end
			end
		end
	end
end

function ProgressService.init()
	BaseService.buyHandler = function(player)
		ProgressService.buySlot(player)
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
	Remotes.get("BuySwordSlot").OnServerEvent:Connect(function(player)
		if RateLimiter.allow(player, "buy", 0.3) then
			ProgressService.buySwordSlot(player)
		end
	end)
	Remotes.get("Rebirth").OnServerEvent:Connect(function(player)
		if RateLimiter.allow(player, "rebirth", 2) then
			ProgressService.rebirth(player)
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
