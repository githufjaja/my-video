-- Монетки: з'являються навколо центру, гравець торкається — отримує очки.
-- Усе, що впливає на рахунок, вирішує сервер (захист від читів).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Shared.Config)

local folder = Instance.new("Folder")
folder.Name = "Coins"
folder.Parent = workspace

local function spawnCoin()
	local coin = Instance.new("Part")
	coin.Name = "Coin"
	coin.Shape = Enum.PartType.Cylinder
	coin.Size = Vector3.new(0.4, 2, 2)
	coin.Color = Color3.fromRGB(255, 200, 40)
	coin.Material = Enum.Material.Neon
	coin.Anchored = true
	coin.CanCollide = false
	local angle = math.random() * math.pi * 2
	local dist = math.random() * Config.SPAWN_RADIUS
	coin.CFrame = CFrame.new(math.cos(angle) * dist, 3, math.sin(angle) * dist) * CFrame.Angles(0, 0, math.rad(90))
	coin.Parent = folder

	local taken = false
	coin.Touched:Connect(function(hit)
		if taken then
			return
		end
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		if not player then
			return
		end
		local stats = player:FindFirstChild("leaderstats")
		local coins = stats and stats:FindFirstChild("Coins")
		if not coins then
			return
		end
		taken = true
		coins.Value += Config.COIN_VALUE
		coin:Destroy()
		task.delay(Config.RESPAWN_SECONDS, spawnCoin)
	end)
end

for _ = 1, Config.COIN_COUNT do
	spawnCoin()
end
