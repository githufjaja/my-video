-- Рахунок гравця в таблиці лідерів + збереження між сесіями (DataStore).
-- У Studio збереження працює, лише якщо гру опубліковано й увімкнено
-- Game Settings → Security → Enable Studio Access to API Services.
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local store = DataStoreService:GetDataStore("PlayerCoins_v1")

local function load(player: Player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Parent = stats
	stats.Parent = player

	local ok, saved = pcall(function()
		return store:GetAsync(tostring(player.UserId))
	end)
	if ok and typeof(saved) == "number" then
		coins.Value = saved
	elseif not ok then
		warn("Не вдалося завантажити дані", player.Name, saved)
	end
end

local function save(player: Player)
	local stats = player:FindFirstChild("leaderstats")
	local coins = stats and stats:FindFirstChild("Coins")
	if not coins then
		return
	end
	local ok, err = pcall(function()
		store:SetAsync(tostring(player.UserId), coins.Value)
	end)
	if not ok then
		warn("Не вдалося зберегти дані", player.Name, err)
	end
end

Players.PlayerAdded:Connect(load)
Players.PlayerRemoving:Connect(save)
for _, p in Players:GetPlayers() do
	task.spawn(load, p)
end

game:BindToClose(function()
	for _, p in Players:GetPlayers() do
		save(p)
	end
end)
