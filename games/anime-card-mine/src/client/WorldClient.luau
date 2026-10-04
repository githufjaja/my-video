--!strict
-- Per-player look of the world: gates open for worlds you have unlocked (local only; the server also guards).
local State = require(script.Parent.State)

local WorldClient = {}

function WorldClient.start()
	local world = workspace:WaitForChild("World")
	local zonesFolder = world:WaitForChild("Zones")

	local lastUnlocked = -1
	local function apply()
		local unlocked = if State.data then State.data.zonesUnlocked else 1
		if unlocked == lastUnlocked then
			return
		end
		lastUnlocked = unlocked
		for _, inst in zonesFolder:GetDescendants() do
			local zoneId = inst:GetAttribute("GateZone")
			if type(zoneId) == "number" then
				local locked = zoneId > unlocked
				if inst:IsA("ProximityPrompt") then
					inst.Enabled = locked
				elseif inst:IsA("BasePart") then
					if inst.Name:sub(1, 5) == "Gate_" then
						inst.CanCollide = locked
						inst.CanQuery = false
						inst.Transparency = if locked then 0.35 else 1
					else
						local sign = inst:FindFirstChild("Sign")
						if sign and sign:IsA("BillboardGui") then
							sign.Enabled = locked
						end
					end
				end
			end
		end
	end

	State.onChanged(apply)
	apply()
end

return WorldClient
