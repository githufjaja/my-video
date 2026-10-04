--!strict
-- Gives every player a pickaxe tool (visual). Hits are sent by the client's click/tap handler,
-- the server validates them in RockService, so the tool itself has no logic.
local Players = game:GetService("Players")

local Pickaxe = {}

local function build(): Tool
	local tool = Instance.new("Tool")
	tool.Name = "Pickaxe"
	tool.ToolTip = "Click rocks to mine them"
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool.GripPos = Vector3.new(0, -1.2, 0)

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.45, 3.4, 0.45)
	handle.Color = Color3.fromRGB(120, 80, 45)
	handle.Material = Enum.Material.Wood
	handle.CanCollide = false
	handle.Parent = tool

	local head = Instance.new("Part")
	head.Name = "Head"
	head.Size = Vector3.new(3, 0.55, 0.55)
	head.Color = Color3.fromRGB(185, 190, 200)
	head.Material = Enum.Material.Metal
	head.CanCollide = false
	head.Massless = true
	head.CFrame = handle.CFrame * CFrame.new(0, 1.5, 0)
	head.Parent = tool

	local weld = Instance.new("WeldConstraint")
	weld.Part0 = handle
	weld.Part1 = head
	weld.Parent = handle
	return tool
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

function Pickaxe.init()
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

return Pickaxe
