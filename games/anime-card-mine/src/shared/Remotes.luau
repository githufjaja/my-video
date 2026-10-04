--!strict
-- RemoteEvents. The server creates them all at startup, the client waits for them.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local FOLDER = "Remotes"

local Remotes = {}

Remotes.names = {
	-- client -> server
	"Hit", -- (target: Instance?)
	"Sell", -- (cardId: string, amount: number | "all")
	"SellGrade", -- (grade: string)
	"PlaceCard", -- (cardId: string, slot: number?)  base
	"RemoveCard", -- (slot: number)  base
	"EquipCard", -- (cardId: string, slot: number?)  sword
	"UnequipCard", -- (slot: number)  sword
	"LevelUp", -- (cardId: string)
	"AutoBest", -- ()
	"BuyDamage", -- (amount: number | "max")
	"BuySlot", -- ()
	"BuySwordSlot", -- ()
	"TeleportTo", -- ("base" | "hub" | worldId: number)
	"Rebirth", -- ()
	"PickupDrop", -- (dropId: number)
	"ClaimOffline", -- (double: boolean)
	"BuyPass", -- (key: string)
	"BuyProduct", -- (key: string)
	"UsePotion", -- (key: string)
	"ToggleAuto", -- ()
	"RequestState", -- ()
	-- server -> client
	"State", -- (snapshot)
	"DamageFx", -- (kind: "dmg" | "money", position: Vector3, amount: number)
	"Notify", -- (kind: "text" | "card", a: string, b: string?)
	"DropSpawn", -- (dropId: number, cardId: string, position: Vector3, lifetime: number)
	"DropGone", -- (dropId: number)
}

local function folder(): Folder
	local existing = ReplicatedStorage:FindFirstChild(FOLDER)
	if existing then
		return existing :: Folder
	end
	if RunService:IsServer() then
		local f = Instance.new("Folder")
		f.Name = FOLDER
		f.Parent = ReplicatedStorage
		return f
	end
	return ReplicatedStorage:WaitForChild(FOLDER) :: Folder
end

function Remotes.init() -- server only
	local f = folder()
	for _, name in Remotes.names do
		if not f:FindFirstChild(name) then
			local e = Instance.new("RemoteEvent")
			e.Name = name
			e.Parent = f
		end
	end
end

function Remotes.get(name: string): RemoteEvent
	local f = folder()
	if RunService:IsServer() then
		return f:FindFirstChild(name) :: RemoteEvent
	end
	return f:WaitForChild(name) :: RemoteEvent
end

return Remotes
