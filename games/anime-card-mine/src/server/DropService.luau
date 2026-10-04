--!strict
-- Personal card drops: every N seconds a card falls near each player. Only that player can see and take it.
-- The server rolls the card, remembers the drop, and checks the pickup (owner, time, distance).
-- The client only DRAWS the drop and reports "I touched it".
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Drops = require(ReplicatedStorage.Shared.Drops)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local CardService = require(script.Parent.CardService)
local MonetizationService = require(script.Parent.MonetizationService)
local RateLimiter = require(script.Parent.RateLimiter)

type Drop = { id: number, cardId: string, position: Vector3, expires: number }

local DropService = {}

local rng = Random.new()
local nextDropAt: { [Player]: number } = {}
local active: { [Player]: { [number]: Drop } } = {}
local nextId = 0

local function rootOf(player: Player): BasePart?
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if hrp and hrp:IsA("BasePart") then
		return hrp
	end
	return nil
end

-- which world's odds apply: the world the player stands in, otherwise the one they are working on
local function worldFor(session: DataService.Session, hrp: BasePart): Zones.World
	local working = session.profile.stage + 1
	local here = Zones.stageAtZ(hrp.Position.Z)
	local stageId: number = if here and here <= working then here else working
	return Zones.worldOfStage(stageId)
end

local function groundPosition(hrp: BasePart): Vector3
	local forward = hrp.CFrame.LookVector * Vector3.new(1, 0, 1)
	if forward.Magnitude < 0.1 then
		forward = Vector3.new(0, 0, -1)
	end
	local pos = hrp.Position + forward.Unit * 11
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local char = hrp.Parent
	params.FilterDescendantsInstances = if char then { char } else {}
	local result = workspace:Raycast(pos + Vector3.new(0, 40, 0), Vector3.new(0, -100, 0), params)
	local y = if result then result.Position.Y else hrp.Position.Y - 3
	return Vector3.new(pos.X, y + 1.5, pos.Z)
end

function DropService.spawnDrop(session: DataService.Session)
	local player = session.player
	local hrp = rootOf(player)
	if not hrp then
		return
	end
	local mine = active[player]
	if not mine then
		mine = {}
		active[player] = mine
	end
	local count = 0
	for _ in mine do
		count += 1
	end
	if count >= Config.DROP_MAX_ACTIVE then
		return
	end
	local world = worldFor(session, hrp)
	local grade = Drops.rollGrade(world, Economy.luck(session), rng)
	local cardId = Drops.pickCard(grade, rng)
	if not cardId then
		return
	end
	nextId += 1
	local drop: Drop = { id = nextId, cardId = cardId, position = groundPosition(hrp), expires = os.clock() + Config.DROP_LIFETIME }
	mine[drop.id] = drop
	Remotes.get("DropSpawn"):FireClient(player, drop.id, drop.cardId, drop.position, Config.DROP_LIFETIME)
end

function DropService.resetTimer(session: DataService.Session)
	nextDropAt[session.player] = os.clock() + Economy.dropInterval(session)
end

-- "Drop Now" product: drop immediately and restart the timer
function DropService.skip(session: DataService.Session)
	DropService.spawnDrop(session)
	DropService.resetTimer(session)
end

function DropService.secondsLeft(player: Player): number
	local t = nextDropAt[player]
	return if t then math.max(0, t - os.clock()) else 0
end

local function pickup(player: Player, dropId: any)
	if type(dropId) ~= "number" then
		return
	end
	local session = DataService.get(player)
	local mine = active[player]
	local drop = if mine then mine[dropId] else nil
	local hrp = rootOf(player)
	if not session or not drop or not hrp then
		return
	end
	if os.clock() > drop.expires then
		mine[dropId] = nil
		Remotes.get("DropGone"):FireClient(player, dropId)
		return
	end
	if (hrp.Position - drop.position).Magnitude > Config.DROP_PICKUP_SERVER then
		return -- too far (client may retry when closer)
	end
	mine[dropId] = nil
	CardService.give(session, drop.cardId, 1)
	Remotes.get("DropGone"):FireClient(player, dropId)
	Replication.notify(player, "card", drop.cardId, nil)
end

function DropService.init()
	Replication.dropIn = DropService.secondsLeft
	MonetizationService.hooks.skipDrop = DropService.skip

	DataService.onLoaded(function(session)
		nextDropAt[session.player] = os.clock() + Config.DROP_FIRST_DELAY
		active[session.player] = {}
		Replication.queue(session.player)
	end)
	DataService.onLeaving(function(session)
		nextDropAt[session.player] = nil
		active[session.player] = nil
	end)

	Remotes.get("PickupDrop").OnServerEvent:Connect(function(player, dropId: any)
		if RateLimiter.allow(player, "pickup", 0.15) then
			pickup(player, dropId)
		end
	end)

	task.spawn(function()
		local lastInterval: { [Player]: number } = {}
		while true do
			task.wait(0.5)
			local now = os.clock()
			for player, session in DataService.all() do
				if not session.released then
					local due = nextDropAt[player]
					if due and now >= due then
						DropService.spawnDrop(session)
						DropService.resetTimer(session)
						Replication.queue(player)
					end
					-- if the interval changed (potion / pass), re-fit the timer and tell the client
					local interval = Economy.dropInterval(session)
					local prev = lastInterval[player]
					if prev and math.abs(prev - interval) > 0.01 and due then
						nextDropAt[player] = math.min(due, now + interval)
						Replication.queue(player)
					end
					lastInterval[player] = interval
					-- expired drops
					local mine = active[player]
					if mine then
						for id, drop in mine do
							if now > drop.expires + 1 then
								mine[id] = nil
								Remotes.get("DropGone"):FireClient(player, id)
							end
						end
					end
				end
			end
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		nextDropAt[player] = nil
		active[player] = nil
	end)
end

return DropService
