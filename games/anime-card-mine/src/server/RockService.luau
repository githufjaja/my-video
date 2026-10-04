--!strict
-- Rocks: spawn, HP, hits, rewards, card drops, respawn. The server decides everything.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Drops = require(ReplicatedStorage.Shared.Drops)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local CardService = require(script.Parent.CardService)
local MonetizationService = require(script.Parent.MonetizationService)
local RateLimiter = require(script.Parent.RateLimiter)

type Rock = {
	zone: Zones.Zone,
	def: Zones.RockType,
	spawnPos: Vector3,
	yaw: number,
	model: Model?,
	body: Part?,
	hp: number,
	maxHp: number,
	alive: boolean,
	contrib: { [Player]: number },
	barFill: Frame?,
	hpLabel: TextLabel?,
}

local RockService = {}

local rng = Random.new()
local rocks: { Rock } = {}
local rockOf: { [Instance]: Rock } = {}
local rocksFolder: Folder

local function shade(c: Color3, k: number): Color3
	return Color3.new(math.clamp(c.R * k, 0, 1), math.clamp(c.G * k, 0, 1), math.clamp(c.B * k, 0, 1))
end

local function updateBar(rock: Rock)
	if rock.barFill and rock.hpLabel then
		rock.barFill.Size = UDim2.fromScale(math.clamp(rock.hp / rock.maxHp, 0, 1), 1)
		rock.hpLabel.Text = Format.number(rock.hp) .. " / " .. Format.number(rock.maxHp)
	end
end

local function buildBillboard(rock: Rock, body: Part)
	local def = rock.def
	local gui = Instance.new("BillboardGui")
	gui.Name = "RockInfo"
	gui.Adornee = body
	gui.Size = UDim2.fromScale(8, 2.6)
	gui.StudsOffset = Vector3.new(0, def.size * 0.7 + 2.2, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 90
	gui.Parent = body

	local name = Instance.new("TextLabel")
	name.Size = UDim2.fromScale(1, 0.45)
	name.BackgroundTransparency = 1
	name.Font = Enum.Font.FredokaOne
	name.Text = def.name
	name.TextScaled = true
	name.TextColor3 = Color3.fromRGB(255, 255, 255)
	name.TextStrokeTransparency = 0.3
	name.Parent = gui

	local back = Instance.new("Frame")
	back.Position = UDim2.fromScale(0.05, 0.52)
	back.Size = UDim2.fromScale(0.9, 0.42)
	back.BackgroundColor3 = Color3.fromRGB(30, 30, 36)
	back.BorderSizePixel = 0
	back.Parent = gui
	local backCorner = Instance.new("UICorner")
	backCorner.CornerRadius = UDim.new(0.3, 0)
	backCorner.Parent = back

	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.Size = UDim2.fromScale(1, 1)
	fill.BackgroundColor3 = Color3.fromRGB(235, 70, 70)
	fill.BorderSizePixel = 0
	fill.Parent = back
	local fillCorner = Instance.new("UICorner")
	fillCorner.CornerRadius = UDim.new(0.3, 0)
	fillCorner.Parent = fill

	local hpText = Instance.new("TextLabel")
	hpText.Size = UDim2.fromScale(1, 1)
	hpText.BackgroundTransparency = 1
	hpText.Font = Enum.Font.FredokaOne
	hpText.TextScaled = true
	hpText.TextColor3 = Color3.fromRGB(255, 255, 255)
	hpText.TextStrokeTransparency = 0.4
	hpText.ZIndex = 2
	hpText.Parent = back

	rock.barFill = fill
	rock.hpLabel = hpText
end

local function spawnRock(rock: Rock)
	local def = rock.def
	local s = def.size
	local base = CFrame.new(rock.spawnPos) * CFrame.Angles(0, rock.yaw, 0)

	local model = Instance.new("Model")
	model.Name = def.name
	local function chunk(name: string, size: Vector3, offset: CFrame, color: Color3): Part
		local p = Instance.new("Part")
		p.Name = name
		p.Anchored = true
		p.Locked = true
		p.Size = size
		p.CFrame = base * offset
		p.Color = color
		p.Material = def.material
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Parent = model
		return p
	end
	local body = chunk("Body", Vector3.new(s, s * 0.8, s), CFrame.new(0, s * 0.4, 0), def.color)
	chunk("Top", Vector3.new(s * 0.7, s * 0.55, s * 0.7), CFrame.new(s * 0.08, s * 0.8, -s * 0.05) * CFrame.Angles(math.rad(7), math.rad(25), math.rad(9)), shade(def.color, 1.12))
	chunk("Side", Vector3.new(s * 0.5, s * 0.5, s * 0.55), CFrame.new(-s * 0.42, s * 0.25, s * 0.3) * CFrame.Angles(math.rad(-6), math.rad(-30), math.rad(8)), shade(def.color, 0.9))
	model.PrimaryPart = body

	rock.hp = def.hp
	rock.maxHp = def.hp
	rock.alive = true
	rock.contrib = {}
	rock.model = model
	rock.body = body
	model:SetAttribute("IsRock", true)
	model:SetAttribute("Zone", rock.zone.id)
	model:SetAttribute("Alive", true)
	buildBillboard(rock, body)
	updateBar(rock)
	rockOf[model] = rock
	model.Parent = rocksFolder
end

local function respawnLater(rock: Rock)
	task.delay(rock.def.respawn + rng:NextNumber() * 2, function()
		spawnRock(rock)
	end)
end

local function playerRoot(player: Player): BasePart?
	local char = player.Character
	if not char then
		return nil
	end
	local humanoid = char:FindFirstChildOfClass("Humanoid")
	local hrp = char:FindFirstChild("HumanoidRootPart")
	if humanoid and humanoid.Health > 0 and hrp and hrp:IsA("BasePart") then
		return hrp
	end
	return nil
end

local function inRange(hrp: BasePart, rock: Rock): number? -- returns distance if hittable
	local body = rock.body
	if not rock.alive or not body then
		return nil
	end
	local d = (hrp.Position - body.Position).Magnitude - rock.def.size * 0.6
	if d <= Config.HIT_RANGE then
		return d
	end
	return nil
end

local function breakRock(rock: Rock, killer: Player)
	local model, body = rock.model, rock.body
	rock.alive = false
	rock.model = nil
	rock.body = nil
	rock.barFill = nil
	rock.hpLabel = nil
	local contrib = rock.contrib
	rock.contrib = {}

	if model and body then
		rockOf[model] = nil
		model:SetAttribute("Alive", false)
		local gui = body:FindFirstChild("RockInfo")
		if gui then
			gui:Destroy()
		end
		for _, part in model:GetChildren() do
			if part:IsA("BasePart") then
				part.CanCollide = false
				part.CanQuery = false
				TweenService:Create(part, TweenInfo.new(0.3), { Size = part.Size * 0.15, Transparency = 1 }):Play()
			end
		end
		Debris:AddItem(model, 0.45)
	end
	local position = if body then body.Position + Vector3.new(0, rock.def.size * 0.6, 0) else rock.spawnPos

	-- split rewards by damage share
	local total = 0
	for _, dmg in contrib do
		total += dmg
	end
	if total > 0 then
		for player, dmg in contrib do
			local session = if player.Parent then DataService.get(player) else nil
			if session then
				local share = dmg / total
				local money = math.max(1, math.floor(rock.def.reward * Economy.moneyMult(player) * share + 0.5))
				Economy.addMoney(session, money)
				session.profile.stats.rocks += 1
				Remotes.get("DamageFx"):FireClient(player, "money", position, money)

				if share >= Config.DROP_SHARE_MIN or player == killer then
					if rng:NextNumber() < rock.def.cardChance then
						local grade = Drops.rollGrade(rock.zone, Economy.luck(player), rng)
						local cardId = Drops.pickCard(grade, rng)
						if cardId then
							CardService.give(session, cardId, 1)
							Replication.notify(player, "card", cardId, nil)
						end
					end
				end
				Replication.queue(player)
			end
		end
	end
	respawnLater(rock)
end

-- target: what the client clicked (may be nil or garbage). The server re-checks everything.
function RockService.hit(player: Player, target: any, skipLimit: boolean?)
	if not skipLimit and not RateLimiter.bucket(player, "hit", Config.HIT_BUCKET_CAPACITY, Config.HIT_REFILL_PER_SEC) then
		return
	end
	local session = DataService.get(player)
	local hrp = playerRoot(player)
	if not session or not hrp then
		return
	end

	local unlocked = session.profile.zonesUnlocked
	local chosen: Rock? = nil
	if typeof(target) == "Instance" and rockOf[target] then
		local candidate = rockOf[target]
		if candidate.zone.id <= unlocked and inRange(hrp, candidate) then
			chosen = candidate
		end
	end
	if not chosen then
		local best = math.huge
		for _, rock in rocks do
			if rock.zone.id <= unlocked then
				local d = inRange(hrp, rock)
				if d and d < best then
					best = d
					chosen = rock
				end
			end
		end
	end
	local rock = chosen
	if not rock or not rock.body then
		return
	end

	local damage = Economy.damage(session)
	local dealt = math.min(damage, rock.hp)
	rock.hp -= dealt
	rock.contrib[player] = (rock.contrib[player] or 0) + dealt
	updateBar(rock)
	local jitter = Vector3.new(rng:NextNumber(-1, 1), 0, rng:NextNumber(-1, 1))
	Remotes.get("DamageFx"):FireClient(player, "dmg", rock.body.Position + Vector3.new(0, rock.def.size * 0.5, 0) + jitter, damage)
	if rock.hp <= 0 then
		breakRock(rock, player)
	end
end

local function buildSpots()
	for _, zone in Zones.list do
		local zrng = Random.new(zone.id * 7919)
		local totalWeight = 0
		for _, def in zone.rocks do
			totalWeight += def.weight
		end
		local placed: { Vector3 } = {}
		local entrance = Vector3.new(0, 0, zone.zMax - 16)
		for _ = 1, zone.rockCount do
			-- weighted type
			local roll = zrng:NextNumber() * totalWeight
			local def = zone.rocks[#zone.rocks]
			for _, candidate in zone.rocks do
				roll -= candidate.weight
				if roll <= 0 then
					def = candidate
					break
				end
			end
			-- position with spacing
			local pos = Vector3.zero
			for _ = 1, 200 do
				pos = Vector3.new(zrng:NextNumber(-zone.xHalf + 20, zone.xHalf - 20), 0, zrng:NextNumber(zone.zMin + 25, zone.zMax - 35))
				local ok = (pos - entrance).Magnitude > 25
				for _, other in placed do
					if (pos - other).Magnitude < 24 then
						ok = false
						break
					end
				end
				if ok then
					break
				end
			end
			table.insert(placed, pos)
			table.insert(rocks, {
				zone = zone,
				def = def,
				spawnPos = pos + Vector3.new(0, 0.4, 0),
				yaw = zrng:NextNumber() * math.pi * 2,
				model = nil,
				body = nil,
				hp = def.hp,
				maxHp = def.hp,
				alive = false,
				contrib = {},
				barFill = nil,
				hpLabel = nil,
			})
		end
	end
end

function RockService.init()
	rocksFolder = Instance.new("Folder")
	rocksFolder.Name = "Rocks"
	rocksFolder.Parent = workspace
	buildSpots()
	for _, rock in rocks do
		spawnRock(rock)
	end

	Remotes.get("Hit").OnServerEvent:Connect(function(player, target: any)
		RockService.hit(player, target)
	end)

	-- Auto Click pass (stage 2): inactive while monetization is off
	task.spawn(function()
		while true do
			task.wait(Config.AUTOCLICK_INTERVAL)
			for player, session in DataService.all() do
				if not session.released and MonetizationService.hasAutoClick(player) then
					RockService.hit(player, nil, true)
				end
			end
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		for _, rock in rocks do
			rock.contrib[player] = nil
		end
	end)
end

return RockService
