--!strict
-- STAGE 2 skeleton: game passes, multipliers, dev products. Fully inert while Monetization.ENABLED = false.
-- Rules followed: ownership is read from Roblox (never from the client); ProcessReceipt grants the product,
-- saves the data, and only then returns PurchaseGranted; receipts are remembered to avoid double grants.
local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local MonetizationConfig = require(ReplicatedStorage.Shared.Monetization)
local Config = require(ReplicatedStorage.Shared.Config)
local DataService = require(script.Parent.DataService)

local MonetizationService = {}

-- Set by Economy (avoids a circular require).
MonetizationService.incomeOf = nil :: ((DataService.Session) -> number)?

local owned: { [Player]: { [string]: boolean } } = {}
local changedCallbacks: { (Player) -> () } = {}

function MonetizationService.isEnabled(): boolean
	return MonetizationConfig.ENABLED
end

function MonetizationService.has(player: Player, key: string): boolean
	if not MonetizationConfig.ENABLED then
		return false
	end
	local mine = owned[player]
	return mine ~= nil and mine[key] == true
end

function MonetizationService.owned(player: Player): { [string]: boolean }
	local out: { [string]: boolean } = {}
	if MonetizationConfig.ENABLED then
		for key in MonetizationConfig.Passes do
			out[key] = MonetizationService.has(player, key)
		end
	end
	return out
end

function MonetizationService.moneyMult(player: Player): number
	local m = 1
	for key, def in MonetizationConfig.Passes do
		if def.moneyMult and MonetizationService.has(player, key) then
			m *= def.moneyMult
		end
	end
	return m
end

function MonetizationService.luckMult(player: Player): number
	local m = 1
	for key, def in MonetizationConfig.Passes do
		if def.luckMult and MonetizationService.has(player, key) then
			m *= def.luckMult
		end
	end
	return m
end

function MonetizationService.bonusSlots(player: Player): number
	local n = 0
	for key, def in MonetizationConfig.Passes do
		if def.bonusSlots and MonetizationService.has(player, key) then
			n += def.bonusSlots
		end
	end
	return math.min(n, Config.PLOT_MAX_SLOTS - Config.START_SLOTS)
end

function MonetizationService.hasAutoClick(player: Player): boolean
	for key, def in MonetizationConfig.Passes do
		if def.autoClick and MonetizationService.has(player, key) then
			return true
		end
	end
	return false
end

function MonetizationService.onChanged(cb: (Player) -> ())
	table.insert(changedCallbacks, cb)
end

local function fireChanged(player: Player)
	for _, cb in changedCallbacks do
		task.spawn(cb, player)
	end
end

-- Called by a (stage 2) shop button through a server-side check.
function MonetizationService.promptPass(player: Player, key: string)
	local def = MonetizationConfig.Passes[key]
	if MonetizationConfig.ENABLED and def and def.id > 0 then
		MarketplaceService:PromptGamePassPurchase(player, def.id)
	end
end

local function loadOwnership(player: Player)
	local mine: { [string]: boolean } = {}
	owned[player] = mine
	for key, def in MonetizationConfig.Passes do
		if def.id > 0 then
			local ok, has = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, def.id)
			end)
			if ok and has then
				mine[key] = true
			end
		end
	end
	fireChanged(player)
end

local function processReceipt(info: { [string]: any }): Enum.ProductPurchaseDecision
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local session = DataService.get(player)
	if not session then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local receiptId = tostring(info.PurchaseId)
	if session.profile.receipts[receiptId] then
		return Enum.ProductPurchaseDecision.PurchaseGranted -- already granted before
	end

	local product: MonetizationConfig.ProductDef? = nil
	for _, def in MonetizationConfig.Products do
		if def.id == info.ProductId and def.id > 0 then
			product = def
		end
	end
	if not product then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	-- grant
	local amount = product.money or 0
	if product.incomeSeconds then
		local incomeOf = MonetizationService.incomeOf
		local income = if incomeOf then incomeOf(session) else 0
		amount = math.max(amount, income * product.incomeSeconds)
	end
	session.profile.money = math.min(Config.MAX_MONEY, session.profile.money + amount)
	session.profile.receipts[receiptId] = true
	DataService.touch(session)

	-- only report success after the data is safely stored
	if not session.offline and not DataService.saveNow(session) then
		session.profile.money -= amount
		session.profile.receipts[receiptId] = nil
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	fireChanged(player)
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

function MonetizationService.init()
	if not MonetizationConfig.ENABLED then
		return
	end
	DataService.onLoaded(function(session)
		loadOwnership(session.player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		owned[player] = nil
	end)
	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased then
			return
		end
		for key, def in MonetizationConfig.Passes do
			if def.id == passId then
				local mine = owned[player]
				if mine then
					mine[key] = true
					fireChanged(player)
				end
			end
		end
	end)
	MarketplaceService.ProcessReceipt = processReceipt
end

return MonetizationService
