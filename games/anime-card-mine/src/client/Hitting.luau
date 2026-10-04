--!strict
-- Click / tap / hold to mine. The client only picks a target; the server decides about damage.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local State = require(script.Parent.State)
local Effects = require(script.Parent.Effects)

local Hitting = {}

local player = Players.LocalPlayer
local hitRemote: RemoteEvent
local lastHit = 0
local lastHint = 0

local function character(): (Model?, BasePart?)
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if hrp and hrp:IsA("BasePart") then
		return char, hrp
	end
	return nil, nil
end

local function rockFromPart(part: Instance): Model?
	local model = part:FindFirstAncestorOfClass("Model")
	if model and model:GetAttribute("IsRock") and model:GetAttribute("Alive") then
		return model
	end
	return nil
end

local function currentStage(): number
	local d = State.data
	return if d then d.stage else 0
end

-- the wall of the stage the player is working on (nil when none / not near)
local function nextWall(hrp: BasePart): BasePart?
	local world = workspace:FindFirstChild("World")
	local stages = world and world:FindFirstChild("Stages")
	local wall = stages and stages:FindFirstChild("Wall_" .. (currentStage() + 1))
	if wall and wall:IsA("BasePart") then
		local dz = hrp.Position.Z - wall.Position.Z - wall.Size.Z / 2
		if dz >= -2 and dz <= Config.WALL_RANGE then
			return wall
		end
	end
	return nil
end

local function distanceTo(hrp: BasePart, rock: Model): number
	local body = rock.PrimaryPart
	if not body then
		return math.huge
	end
	return (hrp.Position - body.Position).Magnitude - body.Size.X * 0.6
end

-- nearest obstacle in reach: a rock or the wall
local function nearestTarget(hrp: BasePart): Instance?
	local best: Instance? = nil
	local bestD = Config.HIT_RANGE
	local folder = workspace:FindFirstChild("Rocks")
	if folder then
		for _, m in folder:GetChildren() do
			if m:IsA("Model") and m:GetAttribute("Alive") and (m:GetAttribute("Stage") :: number) <= currentStage() + 1 then
				local d = distanceTo(hrp, m)
				if d <= bestD then
					best, bestD = m, d
				end
			end
		end
	end
	local wall = nextWall(hrp)
	if wall then
		local dz = hrp.Position.Z - wall.Position.Z - wall.Size.Z / 2
		if dz <= bestD then
			best = wall
		end
	end
	return best
end

local function targetUnderRay(ray: Ray, char: Model, hrp: BasePart): Instance?
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { char }
	local result = workspace:Raycast(ray.Origin, ray.Direction * 300, params)
	if result then
		local rock = rockFromPart(result.Instance)
		if rock and distanceTo(hrp, rock) <= Config.HIT_RANGE and (rock:GetAttribute("Stage") :: number) <= currentStage() + 1 then
			return rock
		end
		local wall = nextWall(hrp)
		if wall and result.Instance == wall then
			return wall
		end
	end
	return nil
end

-- ray: ray under the pointer (nil = just hit the nearest obstacle)
local function tryHit(ray: Ray?)
	local now = os.clock()
	if now - lastHit < Config.CLIENT_HIT_INTERVAL then
		return
	end
	local char, hrp = character()
	if not char or not hrp then
		return
	end
	local target: Instance? = nil
	if ray then
		target = targetUnderRay(ray, char, hrp)
	end
	if not target then
		target = nearestTarget(hrp)
	end
	if not target then
		if now - lastHint > 2.5 then
			lastHint = now
			Effects.toast("Nothing in reach. Walk closer to a rock or the wall!", nil)
		end
		return
	end
	lastHit = now
	hitRemote:FireServer(target)
end

local function mouseRay(): Ray?
	local camera = workspace.CurrentCamera
	if not camera then
		return nil
	end
	local loc = UserInputService:GetMouseLocation()
	return camera:ViewportPointToRay(loc.X, loc.Y)
end

local holding = false
local function startHold(getRay: () -> Ray?)
	if holding then
		return
	end
	holding = true
	task.spawn(function()
		while holding do
			tryHit(getRay())
			task.wait(Config.CLIENT_HIT_INTERVAL)
		end
	end)
end

function Hitting.start(swingButton: TextButton)
	hitRemote = Remotes.get("Hit")

	local touches: { [InputObject]: { pos: Vector2, t: number } } = {}

	UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			startHold(mouseRay)
		elseif input.UserInputType == Enum.UserInputType.Touch then
			touches[input] = { pos = Vector2.new(input.Position.X, input.Position.Y), t = os.clock() }
		elseif input.KeyCode == Enum.KeyCode.ButtonR2 or input.KeyCode == Enum.KeyCode.ButtonX then
			startHold(function()
				return nil
			end)
		end
	end)

	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.KeyCode == Enum.KeyCode.ButtonR2 or input.KeyCode == Enum.KeyCode.ButtonX then
			holding = false
		elseif input.UserInputType == Enum.UserInputType.Touch then
			local start = touches[input]
			touches[input] = nil
			-- a tap (short and without dragging) hits; dragging rotates the camera
			if start and os.clock() - start.t < 0.35 and (Vector2.new(input.Position.X, input.Position.Y) - start.pos).Magnitude < 25 then
				local camera = workspace.CurrentCamera
				if camera then
					tryHit(camera:ScreenPointToRay(input.Position.X, input.Position.Y))
				end
			end
		end
	end)

	-- on-screen button: hold to keep hitting the nearest rock
	swingButton.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
			startHold(function()
				return nil
			end)
		end
	end)
	swingButton.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
			holding = false
		end
	end)
end

return Hitting
