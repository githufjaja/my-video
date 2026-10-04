-- ===== SERVER scenario =====
ctx.isServer = true
local log = {}
local lastState = {}
local function count(name) return (log[name] or 0) end
ctx.hooks.remote = function(dir, remote, player, ...)
	local name = remote.Name
	if dir == "client" then
		log[name] = (log[name] or 0) + 1
		if name == "State" then lastState[player] = ... end
		if name == "Notify" then print("   notify:", ...) end
		if name == "DropSpawn" then log.lastDrop = { ... } end
	end
end
local Remotes

local function fireServer(p, name, ...)
	if name == "TeleportTo" then run(1.6) end
	if name == "Rebirth" then run(2.1) end
	if name == "BuyPass" or name == "BuyProduct" then run(0.6) end
	Remotes[name].OnServerEvent:Fire(p, ...)
	run(0.35)
end
local function join(name, id, pos)
	local p = newPlayer(name, id)
	Players.PlayerAdded:Fire(p)
	spawnCharacter(p, pos)
	return p
end
local function leave(p)
	Players.PlayerRemoving:Fire(p)
	run(1)
	p.Parent = nil
end

task.spawn(function()
	local Main = ServerF.Main
	R(Main).fn(Main)
	Remotes = ReplicatedStorage:FindFirstChild("Remotes")
	run(0.5)
	local DataService = require(ServerF.DataService)
	local Zones = require(SharedF.Zones)
	local Config = require(SharedF.Config)
	local Cards = require(SharedF.Cards)
	local Economy = require(ServerF.Economy)
	local MonetizationService = require(ServerF.MonetizationService)

	-- ---- world ----
	local stages = workspace.World.Stages
	check(stages:FindFirstChild("Wall_9") ~= nil, "9 walls built")
	check(#workspace.Rocks:GetChildren() == 72, "72 rocks spawned (9 stages x 8): " .. #workspace.Rocks:GetChildren())
	check(#workspace.Plots:GetChildren() == Config.PLOT_COUNT, "16 plots")
	check(workspace.World:FindFirstChild("VipDoor") ~= nil, "VIP door exists")

	-- ---- new player, datastore ok ----
	local p = join("Tester", 1001)
	run(3)
	local s = DataService.get(p)
	check(s ~= nil, "session loaded")
	check(s and not s.offline, "online (not offline mode)")
	check(lastState[p] ~= nil, "first snapshot sent")
	check(p.Backpack:FindFirstChild("Sword") ~= nil or p.Character:FindFirstChild("Sword") ~= nil, "sword given")
	check(p.Character:FindFirstChild("Sword") ~= nil, "sword equipped")
	local st = lastState[p]
	check(st.money == 0 and st.stage == 0 and st.swordSlots == 1 and st.totalSlots == 6, "default snapshot values")

	-- ---- teleports ----
	fireServer(p, "TeleportTo", 1)
	check(p.Character.HumanoidRootPart.Position.Z < -50, "teleported to world 1")
	fireServer(p, "TeleportTo", 2)
	check(p.Character.HumanoidRootPart.Position.Z < -50 and p.Character.HumanoidRootPart.Position.Z > -150, "world 2 locked (stayed in world 1)")
	fireServer(p, "TeleportTo", "base")
	check(p.Character.HumanoidRootPart.Position.Z > 50, "teleported to base")

	-- ---- hitting a rock ----
	fireServer(p, "TeleportTo", 1)
	local rock
	for _, m in workspace.Rocks:GetChildren() do
		if m:GetAttribute("Stage") == 1 then rock = m break end
	end
	placeCharacter(p, rock.PrimaryPart.Position + V3new(6, 3, 0))
	local before = log.DamageFx or 0
	for i = 1, 40 do
		Remotes.Hit.OnServerEvent:Fire(p, rock)
		run(0.14)
	end
	check((log.DamageFx or 0) > before, "damage numbers sent")
	check(s.profile.money > 0, "money from rocks: " .. s.profile.money)
	check(s.profile.stats.rocks > 0, "rock stat increments")
	check(rock.Parent == nil or rock:GetAttribute("Alive") == false, "rock was broken")
	run(25)
	local respawned = 0
	for _, m in workspace.Rocks:GetChildren() do if m:GetAttribute("Alive") == true then respawned += 1 end end
	check(respawned == 72, "rocks respawned: " .. respawned)

	-- ---- rate limit ----
	local d1 = log.DamageFx
	for i = 1, 100 do Remotes.Hit.OnServerEvent:Fire(p, nil) end
	local gained = log.DamageFx - d1
	check(gained <= 6, "burst of 100 hits limited to " .. gained)
	run(1)

	-- ---- buy damage ----
	s.profile.money = 1e6
	fireServer(p, "BuyDamage", "max")
	check(s.profile.damageLevel > 20, "bought damage levels: " .. s.profile.damageLevel)
	local lvl = s.profile.damageLevel
	fireServer(p, "BuyDamage", 12345) -- invalid amount
	check(s.profile.damageLevel == lvl, "invalid amount rejected")
	check(Economy.damage(s) >= 20, "damage grew")

	-- ---- wall ----
	local wall1 = stages.Wall_1
	s.profile.damageLevel = 400
	placeCharacter(p, V3new(0, 4, wall1.Position.Z + 8))
	for i = 1, 60 do
		Remotes.Hit.OnServerEvent:Fire(p, wall1)
		run(0.14)
		if s.profile.stage >= 1 then break end
	end
	check(s.profile.stage == 1, "wall 1 broken -> stage 1 (stage=" .. s.profile.stage .. ")")
	check(p:GetAttribute("WallStage") == 0, "wall attributes reset")
	-- walking past wall 2 without breaking it is undone by the guard
	placeCharacter(p, V3new(0, 4, stages.Wall_2.Position.Z - 20))
	run(1.5)
	check(p.Character.HumanoidRootPart.Position.Z > stages.Wall_2.Position.Z, "guard pushed player back")
	-- world unlock message on the last wall of world 1
	s.profile.stage = 2
	s.profile.damageLevel = 1000
	placeCharacter(p, V3new(0, 4, stages.Wall_3.Position.Z + 8))
	for i = 1, 60 do
		Remotes.Hit.OnServerEvent:Fire(p, nil)
		run(0.14)
		if s.profile.stage >= 3 then break end
	end
	check(s.profile.stage == 3, "wall 3 broken (world 1 complete)")
	fireServer(p, "TeleportTo", 2)
	check(p.Character.HumanoidRootPart.Position.Z < -250, "world 2 reachable after completing world 1: z=" .. p.Character.HumanoidRootPart.Position.Z)

	-- ---- card drop timer ----
	fireServer(p, "TeleportTo", "hub")
	run(30)
	check((log.DropSpawn or 0) >= 1, "card drop spawned after the first delay")
	local drop = log.lastDrop
	check(drop ~= nil and Cards.byId[drop[2]] ~= nil, "drop carries a real card id")
	-- picking up from far away must fail
	placeCharacter(p, V3new(400, 4, 400))
	fireServer(p, "PickupDrop", drop[1])
	local invBefore = 0
	for _, n in s.profile.inv do invBefore += n end
	check(invBefore == 0, "pickup from far away rejected")
	placeCharacter(p, drop[3] + V3new(2, 0, 0))
	fireServer(p, "PickupDrop", drop[1])
	local invAfter = 0
	for _, n in s.profile.inv do invAfter += n end
	check(invAfter == 1, "pickup near the drop gives the card")
	fireServer(p, "PickupDrop", drop[1])
	local again = 0
	for _, n in s.profile.inv do again += n end
	check(again == 1, "same drop cannot be taken twice")
	fireServer(p, "PickupDrop", "x")
	fireServer(p, "PickupDrop", 99999)

	-- ---- cards ----
	local giveCard = require(ServerF.CardService).give
	giveCard(s, "mochi_sprout", 6)
	giveCard(s, "velka_stormwhisk", 2)
	fireServer(p, "PlaceCard", "mochi_sprout")
	check(s.profile.placed["1"] == "mochi_sprout", "card placed on base slot 1")
	fireServer(p, "PlaceCard", "mochi_sprout", 3)
	check(s.profile.placed["3"] == "mochi_sprout", "card placed on base slot 3")
	fireServer(p, "PlaceCard", "mochi_sprout", 99)
	fireServer(p, "PlaceCard", "nope")
	fireServer(p, "PlaceCard", 5)
	fireServer(p, "EquipCard", "velka_stormwhisk")
	check(s.profile.sword["1"] == "velka_stormwhisk", "card equipped in sword")
	fireServer(p, "EquipCard", "velka_stormwhisk")
	check(s.profile.sword["2"] == nil, "sword has only 1 slot")
	local dmgBefore = Economy.damage(s)
	check(select(1, Economy.swordBonus(s)) > 0, "sword bonus > 0")
	-- level up needs spare copies
	local lvBefore = s.profile.levels["mochi_sprout"] or 1
	fireServer(p, "LevelUp", "mochi_sprout")
	check((s.profile.levels["mochi_sprout"] or 1) == lvBefore + 1, "card leveled up")
	check(Economy.income(s) > 0, "base income > 0: " .. Economy.income(s))
	fireServer(p, "Sell", "mochi_sprout", 1)
	fireServer(p, "SellGrade", "Rare")
	fireServer(p, "SellGrade", "Bogus")
	fireServer(p, "AutoBest")
	fireServer(p, "RemoveCard", 1)
	fireServer(p, "UnequipCard", 1)
	check(s.profile.sword["1"] == nil, "sword card taken out")
	check(p.Character:FindFirstChild("Sword") ~= nil, "still holds the sword")

	-- buying slots
	s.profile.money = 1e12
	fireServer(p, "BuySlot")
	check(s.profile.slots == 7, "base slot bought")
	fireServer(p, "BuySwordSlot")
	check(s.profile.swordSlots == 1 and Economy.swordSlots(s) == 2, "sword slot bought")

	-- ---- rebirth ----
	s.profile.stage = 2
	fireServer(p, "Rebirth")
	check(s.profile.rebirths == 0, "rebirth refused below the stage requirement")
	s.profile.stage = 3
	local cardsKept = s.profile.inv
	fireServer(p, "Rebirth")
	check(s.profile.rebirths == 1 and s.profile.stage == 0 and s.profile.money == 0 and s.profile.damageLevel == 0, "rebirth resets progress")
	check(s.profile.slots == 7, "rebirth keeps slots")
	check(Economy.moneyMult(s) >= 1.25, "rebirth money multiplier")

	-- ---- shop (Studio test mode) ----
	fireServer(p, "BuyPass", "DoubleMoney")
	check(MonetizationService.has(p, "DoubleMoney"), "pass granted in studio test mode")
	check(Economy.moneyMult(s) >= 2.5, "money mult includes pass: " .. Economy.moneyMult(s))
	fireServer(p, "BuyPass", "SwordSlots")
	check(Economy.swordSlots(s) == 4, "sword slots pass: " .. Economy.swordSlots(s))
	fireServer(p, "BuyPass", "BaseSlots")
	check(Economy.baseSlots(s) == 10, "base slots pass: " .. Economy.baseSlots(s))
	fireServer(p, "BuyPass", "FasterDrops")
	check(Economy.dropInterval(s) == Config.DROP_INTERVAL_FAST, "faster drops pass")
	fireServer(p, "BuyPass", "AutoSwing")
	check(lastState[p].autoOwned == true, "auto swing owned")
	do
		local near
		for _, m in workspace.Rocks:GetChildren() do if m:GetAttribute("Stage") == 1 and m:GetAttribute("Alive") then near = m break end end
		placeCharacter(p, near.PrimaryPart.Position + Vector3.new(5, 3, 0))
		local d0 = log.DamageFx
		run(2.2)
		check(log.DamageFx > d0, "Auto Swing hits by itself: +" .. (log.DamageFx - d0))
	end
	fireServer(p, "BuyPass", "VIP")
	check(p:GetAttribute("IsVip") == true, "VIP attribute set")
	check(p.Character.Head:FindFirstChild("VipTag") ~= nil, "VIP tag over the head")
	fireServer(p, "BuyPass", "Nope")
	fireServer(p, "BuyPass", 3)
	fireServer(p, "BuyProduct", "StarterPack")
	check(s.profile.starterBought and (s.profile.inv["toru_emberfang"] or 0) >= 1 and (s.profile.potions["Luck15"] or 0) == 2, "starter pack content (fixed card + potions)")
	check(lastState[p].starterBought == true, "starterBought replicated")
	fireServer(p, "UsePotion", "Luck15")
	check(MonetizationService.boostMult(s, "luck") == 2 and Economy.luck(s) >= 2, "luck potion active: " .. Economy.luck(s))
	check(lastState[p].boosts.luck ~= nil and lastState[p].boosts.luck.remaining > 800, "boost replicated with remaining time")
	fireServer(p, "UsePotion", "Drop15")
	check(lastState[p].boosts.drop == nil, "cannot use a potion you do not own")
	fireServer(p, "UsePotion", "Cash15")
	local money0 = s.profile.money
	fireServer(p, "BuyProduct", "MoneyL")
	check(s.profile.money > money0, "money pack granted")
	local drops0 = log.DropSpawn or 0
	fireServer(p, "BuyProduct", "SkipDrop")
	check((log.DropSpawn or 0) == drops0 + 1, "skip-drop product spawns a card")
	fireServer(p, "ToggleAuto")
	check(lastState[p].autoOn == false, "auto toggled off")
	fireServer(p, "ToggleAuto")
	-- boost expiry sweep
	run(901)
	check(lastState[p].boosts.luck == nil, "boost expired and replicated")

	-- ---- offline reward + save/load roundtrip ----
	local profileBefore = s.profile
	local userKey = "Player_1001"
	check(DS.db[userKey] ~= nil, "data was saved to the datastore (autosave / stage save)")
	leave(p)
	DS.db[userKey].data.lastSeen = os.time() - 7200
	check(DS.db[userKey].lock == nil, "lock released on leave")
	check(DS.db[userKey].data.rebirths == 1 and DS.db[userKey].data.v == 2, "saved profile is v2 with rebirth")
	local p2 = join("Tester", 1001)
	run(4)
	local s2 = DataService.get(p2)
	check(s2 ~= nil, "second session loaded")
	check(s2.profile.rebirths == 1 and s2.profile.slots == 7, "data restored after rejoin")
	check(s2.profile.offlinePending > 0, "offline reward computed: " .. s2.profile.offlinePending)
	check(lastState[p2].offlinePending > 0, "offline reward replicated")
	local m1 = s2.profile.money
	local pending = s2.profile.offlinePending
	fireServer(p2, "ClaimOffline", false)
	check(s2.profile.offlinePending == 0 and s2.profile.money >= m1 + pending - 1, "offline reward claimed")
	-- double it (test mode)
	run(0.7)
	s2.profile.offlinePending = 1000
	local m2 = s2.profile.money
	fireServer(p2, "ClaimOffline", true)
	check(s2.profile.offlinePending == 0 and s2.profile.money >= m2 + 2000 - 1, "double offline reward (studio test)")

	-- ---- ProcessReceipt (real product id path) ----
	local MonetizationConfig = require(SharedF.Monetization)
	MonetizationConfig.Products.MoneyS.id = 555
	check(MarketplaceService.ProcessReceipt ~= nil, "ProcessReceipt is set")
	local before = s2.profile.money
	local d1 = MarketplaceService.ProcessReceipt({ PlayerId = 1001, PurchaseId = "r1", ProductId = 555 })
	check(tostring(d1) == "Enum.ProductPurchaseDecision.PurchaseGranted", "receipt granted: " .. tostring(d1))
	check(s2.profile.money > before and s2.profile.receipts["r1"] == true, "receipt recorded and money granted")
	local afterFirst = s2.profile.money
	local d2 = MarketplaceService.ProcessReceipt({ PlayerId = 1001, PurchaseId = "r1", ProductId = 555 })
	check(tostring(d2) == "Enum.ProductPurchaseDecision.PurchaseGranted" and s2.profile.money == afterFirst, "same receipt is not granted twice")
	check(tostring(MarketplaceService.ProcessReceipt({ PlayerId = 9999, PurchaseId = "r2", ProductId = 555 })) == "Enum.ProductPurchaseDecision.NotProcessedYet", "receipt for absent player waits")
	check(tostring(MarketplaceService.ProcessReceipt({ PlayerId = 1001, PurchaseId = "r3", ProductId = 777 })) == "Enum.ProductPurchaseDecision.NotProcessedYet", "unknown product waits")
	DS.mode = "error"
	local d3 = MarketplaceService.ProcessReceipt({ PlayerId = 1001, PurchaseId = "r4", ProductId = 555 })
	check(tostring(d3) == "Enum.ProductPurchaseDecision.NotProcessedYet", "save failure -> NotProcessedYet (Roblox retries)")
	DS.mode = "ok"
	MonetizationConfig.Products.MoneyS.id = 0

	-- ---- migration from v1 ----
	DS.db["Player_2002"] = { data = { v = 1, money = 500, damageLevel = 3, slots = 8, zonesUnlocked = 2, inv = { mochi_sprout = 2 }, placed = { ["1"] = "mochi_sprout" }, stats = { rocks = 1, cards = 2 }, receipts = {} } }
	local p3 = join("OldPlayer", 2002)
	run(4)
	local s3 = DataService.get(p3)
	check(s3 ~= nil and s3.profile.stage == 3 and s3.profile.slots == 8 and s3.profile.money >= 500 and s3.profile.placed["1"] == "mochi_sprout" and s3.profile.inv.mochi_sprout == 2, "v1 profile migrated (zonesUnlocked 2 -> stage 3)")
	check(s3 and s3.profile.v == 2 and s3.profile.rebirths == 0, "migrated profile has v2 defaults")

	-- ---- corrupt / hostile data ----
	DS.db["Player_3003"] = { data = { money = -5, damageLevel = "x", slots = 999, stage = 99, inv = { bogus = 5, mochi_sprout = -1, pip_tinkerfox = 3 }, placed = { ["1"] = 5, ["99"] = "mochi_sprout" }, sword = { ["1"] = "nope" }, levels = { mochi_sprout = 77 }, potions = { Fake = 3, Luck15 = 2 }, boosts = { luck = { mult = 1000, ends = 1 }, junk = {} } } }
	local p4 = join("Corrupt", 3003)
	run(4)
	local s4 = DataService.get(p4)
	check(s4 ~= nil and s4.profile.money == 0 and s4.profile.slots == 18 and s4.profile.stage == 9, "hostile numbers clamped")
	check(s4 and s4.profile.inv.bogus == nil and s4.profile.inv.pip_tinkerfox == 3 and next(s4.profile.placed) == nil, "bad cards dropped")
	check(s4 and s4.profile.levels.mochi_sprout == 10 and s4.profile.potions.Fake == nil and s4.profile.boosts.luck == nil and s4.profile.boosts.junk == nil, "levels/potions/boosts sanitized")

	-- ---- datastore errors ----
	DS.mode = "error"
	local p5 = join("NoApi", 4004)
	run(3)
	local s5 = DataService.get(p5)
	check(s5 ~= nil and s5.offline == true, "studio offline mode when DataStore errors")
	check(lastState[p5] ~= nil and lastState[p5].offline == true, "offline flag replicated")
	check(R(p5).kicked == nil, "player not kicked in studio")
	fireServer(p5, "TeleportTo", 1)
	DS.mode = "ok"

	-- ---- session lock ----
	DS.db["Player_5005"] = { data = { money = 1 }, lock = { job = "other-server", t = os.time() } }
	local p6 = join("Locked", 5005)
	run(12)
	check(DataService.get(p6) == nil and R(p6).kicked ~= nil, "player kicked while another server holds the lock")
	check(DS.db["Player_5005"].data.money == 1, "locked data untouched")

	-- ---- shutdown ----
	for _, fn in ctx.closeFns do task.spawn(fn) end
	run(5)
	check(DS.db["Player_1001"].lock == nil and DS.db["Player_2002"].lock == nil, "BindToClose released locks")

	print("---- server scenario finished; problems: " .. #errors)
	ctx.finished = true
end)

for _ = 1, 6000 do
	if ctx.finished then break end
	advance(1 / 30)
	heartbeat:Fire(1 / 30)
end
if not ctx.finished then note("TIMEOUT", "scenario did not finish") end
print("TOTAL PROBLEMS:", #errors)
for _, e in errors do print(e) end
