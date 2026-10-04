--!strict
-- Per-player look of the world (local only; the server also guards):
--  * a wall you have broken becomes see-through and walkable;
--  * the VIP door is open only for VIP players.
local Players = game:GetService("Players")

local State = require(script.Parent.State)

local WorldClient = {}

function WorldClient.start()
	local player = Players.LocalPlayer
	local world = workspace:WaitForChild("World")
	local stages = world:WaitForChild("Stages")

	local function applyWalls()
		local broken = if State.data then State.data.stage else 0
		for _, inst in stages:GetChildren() do
			local wallStage = inst:GetAttribute("WallStage")
			if type(wallStage) == "number" and inst:IsA("BasePart") then
				local closed = wallStage > broken
				inst.CanCollide = closed
				inst.CanQuery = closed
				inst.Transparency = if closed then 0 else 1
				local sign = inst:FindFirstChild("Sign")
				if sign and sign:IsA("BillboardGui") then
					sign.Enabled = closed
				end
			end
		end
	end

	local function applyVip()
		local vip = player:GetAttribute("IsVip") == true
		for _, inst in world:GetChildren() do
			if inst:IsA("BasePart") and inst:GetAttribute("VipDoor") then
				inst.CanCollide = not vip
				inst.Transparency = if vip then 0.85 else 0.3
			end
		end
	end

	State.onChanged(applyWalls)
	player:GetAttributeChangedSignal("IsVip"):Connect(applyVip)
	applyWalls()
	applyVip()
end

return WorldClient
