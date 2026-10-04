--!strict
-- The sword: a Tool every player carries. The swing is animated by the SERVER (Tool.Grip tween), so everyone sees it.
-- Damage is dealt by RockService when the client sends a hit; the tool itself has no damage logic.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Sword = {}

local baseGrips: { [Tool]: CFrame } = setmetatable({}, { __mode = "k" }) :: any
local swingingUntil: { [Tool]: number } = setmetatable({}, { __mode = "k" }) :: any

local function part(tool: Tool, name: string, size: Vector3, offset: CFrame, color: Color3, material: Enum.Material): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Color = color
	p.Material = material
	p.CanCollide = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CFrame = offset
	p.Parent = tool
	return p
end

local function build(): Tool
	local tool = Instance.new("Tool")
	tool.Name = "Sword"
	tool.ToolTip = "Click / tap to swing at the nearest obstacle"
	tool.CanBeDropped = false
	tool.RequiresHandle = true

	-- built along -Z like a classic sword: handle at the origin, blade pointing forward
	local handle = part(tool, "Handle", Vector3.new(0.4, 0.4, 1.3), CFrame.new(), Color3.fromRGB(70, 45, 30), Enum.Material.Wood)
	local guard = part(tool, "Guard", Vector3.new(0.35, 1.9, 0.4), CFrame.new(0, 0, -0.8), Color3.fromRGB(230, 190, 70), Enum.Material.Metal)
	local blade = part(tool, "Blade", Vector3.new(0.18, 0.7, 4.2), CFrame.new(0, 0, -3.0), Color3.fromRGB(200, 225, 255), Enum.Material.Neon)
	for _, p in { guard, blade } do
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = handle
		weld.Part1 = p
		weld.Parent = handle
	end
	handle.Massless = false
	tool.Grip = CFrame.new(0, 0, 0.2)
	baseGrips[tool] = tool.Grip
	return tool
end

-- Plays a quick slash on the player's equipped sword.
function Sword.swing(player: Player)
	local char = player.Character
	local tool = char and char:FindFirstChild("Sword")
	if not tool or not tool:IsA("Tool") then
		return
	end
	local now = os.clock()
	if (swingingUntil[tool] or 0) > now then
		return
	end
	swingingUntil[tool] = now + 0.17
	local base = baseGrips[tool] or tool.Grip
	baseGrips[tool] = base
	TweenService:Create(tool, TweenInfo.new(0.06, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Grip = base * CFrame.Angles(math.rad(75), 0, 0) }):Play()
	task.delay(0.07, function()
		if tool.Parent then
			TweenService:Create(tool, TweenInfo.new(0.09, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { Grip = base }):Play()
		end
	end)
end

local function onCharacter(player: Player, char: Model)
	local backpack = player:WaitForChild("Backpack", 10)
	local humanoid = char:WaitForChild("Humanoid", 10)
	if not backpack or not humanoid or not humanoid:IsA("Humanoid") then
		return
	end
	local tool = build()
	tool.Parent = backpack
	task.wait(0.2)
	if char.Parent and tool.Parent == backpack then
		humanoid:EquipTool(tool)
	end
end

function Sword.init()
	local function watch(player: Player)
		player.CharacterAdded:Connect(function(char)
			task.spawn(onCharacter, player, char)
		end)
		if player.Character then
			task.spawn(onCharacter, player, player.Character)
		end
	end
	Players.PlayerAdded:Connect(watch)
	for _, player in Players:GetPlayers() do
		watch(player)
	end
end

return Sword
