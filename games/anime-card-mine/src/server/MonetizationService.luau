--!strict
-- Game passes, potions / boosts, dev products, packs.
-- Rules followed:
--  * ownership is read from Roblox (never from the client);
--  * ProcessReceipt grants the product, SAVES, and only then returns PurchaseGranted; receipts are remembered;
--  * packs have fixed contents (no paid random);
--  * in Studio with STUDIO_TEST_GRANTS every button grants the item for free (test mode, never on live servers).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local MonetizationConfig = require(ReplicatedStorage.Shared.Monetization)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local RateLimiter = require(script.Parent.RateLimiter)

local MonetizationService = {}

-- Set by other services (avoids circular requires).
MonetizationService.hooks = {
	giveCard = nil :: ((DataService.Session, string, number) -> ())?,
	skipDrop = nil :: ((DataService.Session) -> ())?,
	doubleOffline = nil :: ((DataService.Session) -> boolean)?,
	income = nil :: ((DataService.Session) -> number)?,
	changed = nil :: ((Player) -> ())?, -- something visible changed: refresh interface
	notify = nil :: ((Player, string, string?) -> ())?,
}

local owned: { [Player]: { [string]: boolean } } = {}
local ready: { [Player]: boolean } = {}

local function studioTest(): boolean
	return MonetizationConfig.STUDIO_TEST_GRANTS and RunService:IsStudio()
end

function MonetizationService.isStudioTest(): boolean
	return studioTest()
end

local function changed(player: Player)
	local cb = MonetizationService.hooks.changed
	if cb then
		cb(player)
	end
end

local function say(player: Player, text: string, level: string?)
	local cb = MonetizationService.hooks.notify
	if cb then
		cb(player, text, level)
	end
end

-- ===== passes =====
function MonetizationService.has(player: Player, key: string): boolean
	if not MonetizationConfig.ENABLED then
		return false
	end
	local mine = owned[player]
	return mine ~= nil and mine[key] == true
end

function MonetizationService.owned(player: Player): { [string]: boolean }
	local out: { [string]: boolean } = {}
	for key in MonetizationConfig.Passes do
		out[key] = MonetizationService.has(player, key)
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

function MonetizationService.bonusBaseSlots(player: Player): number
	local n = 0
	for key, def in MonetizationConfig.Passes do
		if def.baseSlots and MonetizationService.has(player, key) then
			n += def.baseSlots
		end
	end
	return n
end

function MonetizationService.bonusSwordSlots(player: Player): number
	local n = 0
	for key, def in MonetizationConfig.Passes do
		if def.swordSlots and MonetizationService.has(player, key) then
			n += def.swordSlots
		end
	end
	return n
end

local function anyFlag(player: Player, flag: string): boolean
	for key, def in MonetizationConfig.Passes do
		if (def :: any)[flag] and MonetizationService.has(player, key) then
			return true
		end
	end
	return false
end

function MonetizationService.hasAutoSwing(player: Player): boolean
	return anyFlag(player, "autoSwing")
end

function MonetizationService.hasFastDrops(player: Player): boolean
	return anyFlag(player, "fastDrops")
end

function MonetizationService.isVip(player: Player): boolean
	return anyFlag(player, "vip")
end

function MonetizationService.isReady(player: Player): boolean
	return ready[player] == true
end

-- ===== boosts / potions =====
-- multiplier of an active boost kind ("luck" | "cash" | "drop"), 1 when none
function MonetizationService.boostMult(session: DataService.Session, kind: string): number
	local b = session.profile.boosts[kind]
	if b and b.ends > os.time() then
		return b.mult
	end
	return 1
end

function MonetizationService.boostRemaining(session: DataService.Session, kind: string): number
	local b = session.profile.boosts[kind]
	if b then
		return math.max(0, b.ends - os.time())
	end
	return 0
end

function MonetizationService.usePotion(player: Player, key: any)
	local session = DataService.get(player)
	if not session or type(key) ~= "string" then
		return
	end
	local def = MonetizationConfig.Potions[key]
	local have = session.profile.potions[key] or 0
	if not def or have < 1 then
		say(player, "You have no such potion.", "bad")
		return
	end
	local left = have - 1
	if left > 0 then
		session.profile.potions[key] = left
	else
		session.profile.potions[key] = nil
	end
	local now = os.time()
	local cur = session.profile.boosts[def.kind]
	if cur and cur.ends > now then
		cur.ends += def.seconds
		cur.mult = math.max(cur.mult, def.mult)
	else
		session.profile.boosts[def.kind] = { mult = def.mult, ends = now + def.seconds }
	end
	DataService.touch(session)
	say(player, def.name .. " active for " .. Format.time(def.seconds), "good")
	changed(player)
end

-- drop expired boosts (keeps data tidy) and tells the client when something ran out
function MonetizationService.sweepBoosts(session: DataService.Session): boolean
	local now = os.time()
	local any = false
	for kind, b in session.profile.boosts do
		if b.ends <= now then
			session.profile.boosts[kind] = nil
			any = true
		end
	end
	if any then
		DataService.touch(session)
	end
	return any
end

-- ===== granting =====
local function grantMoney(session: DataService.Session, amount: number)
	session.profile.money = math.clamp(session.profile.money + amount, 0, Config.MAX_MONEY)
end

local function grantBundle(session: DataService.Session, bundle: MonetizationConfig.Bundle)
	if bundle.money then
		grantMoney(session, bundle.money)
	end
	if bundle.cards then
		local give = MonetizationService.hooks.giveCard
		for _, c in bundle.cards do
			if give then
				give(session, c.id, c.n)
			end
		end
	end
	if bundle.potions then
		for _, p in bundle.potions do
			session.profile.potions[p.key] = (session.profile.potions[p.key] or 0) + p.n
		end
	end
end

-- Applies a dev product to the player's data. Returns false if it cannot be granted right now.
function MonetizationService.grantProduct(session: DataService.Session, key: string): boolean
	local def = MonetizationConfig.Products[key]
	if not def then
		return false
	end
	local hooks = MonetizationService.hooks
	if def.kind == "money" then
		local income = if hooks.income then hooks.income(session) else 0
		grantMoney(session, math.max(def.money or 0, income * (def.incomeSeconds or 0)))
	elseif def.kind == "potion" and def.potion then
		session.profile.potions[def.potion] = (session.profile.potions[def.potion] or 0) + (def.n or 1)
	elseif def.kind == "skipDrop" then
		if not hooks.skipDrop then
			return false
		end
		hooks.skipDrop(session)
	elseif def.kind == "doubleOffline" then
		if not hooks.doubleOffline or not hooks.doubleOffline(session) then
			return false
		end
	elseif def.kind == "bundle" and def.bundle then
		grantBundle(session, def.bundle)
		if def.once then
			session.profile.starterBought = true
		end
	else
		return false
	end
	DataService.touch(session)
	changed(session.player)
	return true
end

-- ===== buying (called from the shop remotes) =====
function MonetizationService.buyPass(player: Player, key: any)
	if type(key) ~= "string" then
		return
	end
	local def = MonetizationConfig.Passes[key]
	if not def or not MonetizationConfig.ENABLED then
		return
	end
	if MonetizationService.has(player, key) then
		say(player, "You already own " .. def.name .. ".", "bad")
		return
	end
	if studioTest() then
		local mine = owned[player]
		if mine then
			mine[key] = true
			say(player, "[Studio test] " .. def.name .. " granted for free.", "good")
			MonetizationService.refreshVip(player)
			changed(player)
		end
		return
	end
	if def.id <= 0 then
		say(player, def.name .. " is coming soon.", "bad")
		return
	end
	MarketplaceService:PromptGamePassPurchase(player, def.id)
end

function MonetizationService.buyProduct(player: Player, key: any)
	if type(key) ~= "string" then
		return
	end
	local def = MonetizationConfig.Products[key]
	local session = DataService.get(player)
	if not def or not session or not MonetizationConfig.ENABLED then
		return
	end
	if studioTest() then
		if MonetizationService.grantProduct(session, key) then
			say(player, "[Studio test] " .. def.name .. " granted for free.", "good")
		else
			say(player, "Nothing to apply right now.", "bad")
		end
		return
	end
	if def.id <= 0 then
		say(player, def.name .. " is coming soon.", "bad")
		return
	end
	MarketplaceService:PromptProductPurchase(player, def.id)
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
		return Enum.ProductPurchaseDecision.PurchaseGranted -- granted earlier
	end

	local productKey: string? = nil
	for key, def in MonetizationConfig.Products do
		if def.id > 0 and def.id == info.ProductId then
			productKey = key
		end
	end
	if not productKey then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	if not MonetizationService.grantProduct(session, productKey) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	session.profile.receipts[receiptId] = true
	DataService.touch(session)

	-- report success only when the data is safely stored
	if not session.offline and not DataService.saveNow(session) then
		warn("[Monetization] could not save after purchase; Roblox will retry the receipt", receiptId)
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

-- ===== VIP tag =====
local function applyVipTag(player: Player)
	local char = player.Character
	local head = char and char:FindFirstChild("Head")
	if not head or not head:IsA("BasePart") then
		return
	end
	local existing = head:FindFirstChild("VipTag")
	if MonetizationService.isVip(player) then
		if existing then
			return
		end
		local gui = Instance.new("BillboardGui")
		gui.Name = "VipTag"
		gui.Adornee = head
		gui.Size = UDim2.fromScale(4, 1.2)
		gui.StudsOffset = Vector3.new(0, 2.6, 0)
		gui.MaxDistance = 80
		gui.Parent = head
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.FredokaOne
		label.Text = "VIP"
		label.TextScaled = true
		label.TextColor3 = Color3.fromRGB(255, 215, 70)
		label.TextStrokeTransparency = 0.2
		label.Parent = gui
	elseif existing then
		existing:Destroy()
	end
end

function MonetizationService.refreshVip(player: Player)
	applyVipTag(player)
	player:SetAttribute("IsVip", MonetizationService.isVip(player))
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
	ready[player] = true
	MonetizationService.refreshVip(player)
	changed(player)
end

-- waits (max ~6 s) until pass ownership is known
function MonetizationService.waitReady(player: Player)
	local t0 = os.clock()
	while not ready[player] and player.Parent and os.clock() - t0 < 6 do
		task.wait(0.1)
	end
end

function MonetizationService.init()
	DataService.onLoaded(function(session)
		owned[session.player] = {}
		if MonetizationConfig.ENABLED then
			loadOwnership(session.player)
		else
			ready[session.player] = true
		end
	end)
	DataService.onLeaving(function(session)
		owned[session.player] = nil
		ready[session.player] = nil
	end)
	local function watch(player: Player)
		player.CharacterAdded:Connect(function()
			task.wait(0.5)
			MonetizationService.refreshVip(player)
		end)
	end
	Players.PlayerAdded:Connect(watch)
	for _, p in Players:GetPlayers() do
		watch(p)
	end

	local function bind(name: string, interval: number, fn: (Player, any) -> ())
		Remotes.get(name).OnServerEvent:Connect(function(player: Player, a: any)
			if RateLimiter.allow(player, "shop", interval) then
				fn(player, a)
			end
		end)
	end
	bind("BuyPass", 0.5, MonetizationService.buyPass)
	bind("BuyProduct", 0.5, MonetizationService.buyProduct)
	bind("UsePotion", 0.3, MonetizationService.usePotion)

	if not MonetizationConfig.ENABLED then
		return
	end
	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased then
			return
		end
		for key, def in MonetizationConfig.Passes do
			if def.id > 0 and def.id == passId then
				local mine = owned[player]
				if mine then
					mine[key] = true
					MonetizationService.refreshVip(player)
					changed(player)
				end
			end
		end
	end)
	MarketplaceService.ProcessReceipt = processReceipt
end

return MonetizationService
