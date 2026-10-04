-- ===== CLIENT scenario =====
ctx.isServer = false
local fired = {}
ctx.hooks.remote = function(dir, remote, player, ...)
	if dir == "server" then
		fired[remote.Name] = (fired[remote.Name] or 0) + 1
	end
end

local Remotes = require(SharedF.Remotes)
local remotesFolder = newInstance("Folder", ReplicatedStorage)
remotesFolder.Name = "Remotes"
for _, n in Remotes.names do local e = newInstance("RemoteEvent", remotesFolder); e.Name = n end

local me = newPlayer("Me", 1)
raw[Players].special.LocalPlayer = me
local playerGui = newInstance("Folder", me); playerGui.Name = "PlayerGui"
local camera = newInstance("Camera")
raw[camera].methods.ViewportPointToRay = function(self, x, y) return Ray.new(Vector3.new(0, 10, 0), Vector3.new(0, -1, 0)) end
raw[camera].methods.ScreenPointToRay = function(self, x, y) return Ray.new(Vector3.new(0, 10, 0), Vector3.new(0, -1, 0)) end
workspace.CurrentCamera = camera

-- minimal world the client scripts look for
local world = newInstance("Folder", workspace); world.Name = "World"
local stages = newInstance("Folder", world); stages.Name = "Stages"
for i = 1, 9 do
	local w = newInstance("Part", stages); w.Name = "Wall_" .. i
	w.Size = Vector3.new(250, 26, 4); w.Position = Vector3.new(0, 13, -50 - i * 100)
	w:SetAttribute("WallStage", i)
	local gui = newInstance("BillboardGui", w); gui.Name = "Sign"
end
local door = newInstance("Part", world); door.Name = "VipDoor"; door:SetAttribute("VipDoor", true)
local rocks = newInstance("Folder", workspace); rocks.Name = "Rocks"
local rock = newInstance("Model", rocks); rock.Name = "Pebble"
local body = newInstance("Part", rock); body.Name = "Body"; body.Size = Vector3.new(4, 3, 4); body.Position = Vector3.new(5, 2, -300)
rock.PrimaryPart = body
rock:SetAttribute("IsRock", true); rock:SetAttribute("Alive", true); rock:SetAttribute("Stage", 1)

spawnCharacter(me, Vector3.new(0, 4, -300))

local function snapshot(over)
	local s = {
		money = 12345, income = 55, damage = 120, damageLevel = 40, boughtSlots = 6, totalSlots = 9, swordBought = 0, swordSlots = 3,
		stage = 3, rebirths = 1,
		inv = { mochi_sprout = 3, velka_stormwhisk = 1, nullia_unwritten = 1, pip_tinkerfox = 12 },
		placed = { ["1"] = "pip_tinkerfox", ["4"] = "mochi_sprout" }, sword = { ["1"] = "toru_emberfang" }, levels = { mochi_sprout = 3 },
		luck = 2.2, moneyMult = 2.5, swordDmgPct = 0.2, swordMoneyPct = 0.1,
		boosts = { luck = { mult = 2, remaining = 800 }, cash = { mult = 2, remaining = 60 } }, potions = { Luck15 = 2, Cash15 = 1 }, passes = { VIP = true },
		dropIn = 40, dropInterval = 90, offline = false, offlinePending = 5000, starterBought = false, autoOwned = true, autoOn = true, studioTest = true,
	}
	for k, v in over or {} do s[k] = v end
	return s
end

task.spawn(function()
	local Main = ClientF.Main
	R(Main).fn(Main)
	run(0.5)
	local gui = playerGui:FindFirstChild("AnimeCardMineUI")
	check(gui ~= nil, "ScreenGui built")
	run(1) -- heartbeat with no state yet
	local ev = remotesFolder
	check(fired.RequestState ~= nil, "client asked for state")

	-- feed state and events
	ev.State.OnClientEvent:Fire(snapshot())
	run(0.5)
	check(true, "state applied without errors")
	ev.DamageFx.OnClientEvent:Fire("dmg", Vector3.new(5, 3, -300), 120)
	ev.DamageFx.OnClientEvent:Fire("money", Vector3.new(5, 3, -300), 450)
	ev.Notify.OnClientEvent:Fire("text", "Hello", "good")
	ev.Notify.OnClientEvent:Fire("text", "Oops", "bad")
	ev.Notify.OnClientEvent:Fire("text", "Plain", nil)
	ev.Notify.OnClientEvent:Fire("card", "nullia_unwritten", nil)
	run(1)

	-- drop visual + pickup
	ev.DropSpawn.OnClientEvent:Fire(7, "toru_emberfang", Vector3.new(30, 2, -300), 60)
	run(0.5)
	check(fired.PickupDrop == nil, "far drop is not picked up")
	ev.DropSpawn.OnClientEvent:Fire(8, "mochi_sprout", Vector3.new(2, 2, -300), 60)
	run(0.5)
	check((fired.PickupDrop or 0) >= 1, "near drop reports a pickup to the server")
	ev.DropGone.OnClientEvent:Fire(8)
	run(61)
	check(workspace.ClientFX:FindFirstChild("CardDrop_7") == nil, "expired drop visual removed")

	-- clicking / tapping
	local function input(kind)
		return { UserInputType = Enum.UserInputType[kind], KeyCode = Enum.KeyCode.A, Position = Vector3.new(100, 100, 0) }
	end
	local down = input("MouseButton1")
	UserInputService.InputBegan:Fire(down, false)
	run(0.5)
	UserInputService.InputEnded:Fire(down)
	check((fired.Hit or 0) >= 1, "click near a rock sends Hit: " .. tostring(fired.Hit))
	local hits = fired.Hit
	UserInputService.InputBegan:Fire(input("MouseButton1"), true) -- over UI: ignored
	run(0.3)
	check(fired.Hit == hits, "clicks over UI are ignored")
	local touch = input("Touch")
	UserInputService.InputBegan:Fire(touch, false)
	run(0.1)
	UserInputService.InputEnded:Fire(touch)
	run(0.3)
	-- near the wall
	placeCharacter(me, Vector3.new(0, 4, stages.Wall_4.Position.Z + 8))
	UserInputService.InputBegan:Fire(down, false)
	run(0.3)
	UserInputService.InputEnded:Fire(down)
	run(0.2)

	-- press every button, with several state variants
	local function pressAll()
		local list = {}
		for _, inst in gui:GetDescendants() do
			if R(inst).class == "TextButton" then table.insert(list, inst) end
		end
		for _, b in list do
			if R(b).parent then
				b.Activated:Fire()
				run(0.05)
			end
		end
		return #list
	end
	local variants = {
		snapshot(),
		snapshot({ money = 0, inv = {}, placed = {}, sword = {}, levels = {}, boosts = {}, potions = {}, passes = {}, stage = 0, rebirths = 0, offlinePending = 0, autoOwned = false, studioTest = false }),
		snapshot({ stage = 9, rebirths = 100, money = 1e15, damageLevel = 1000, boughtSlots = 18, swordBought = 2, swordSlots = 5, totalSlots = 21, starterBought = true, passes = { VIP = true, DoubleMoney = true, SwordSlots = true }, offlinePending = 0, autoOn = false }),
	}
	for vi, v in variants do
		ev.State.OnClientEvent:Fire(v)
		run(0.4)
		-- select a card so detail panels render
		for _, id in { "mochi_sprout", "nullia_unwritten", "pip_tinkerfox" } do
			if v.inv[id] then
				local State = require(ClientF.State)
				State.select(id)
				run(0.2)
			end
		end
		local n = pressAll()
		pressAll() -- second pass: windows now in other states
		run(0.5)
		check(true, "variant " .. vi .. ": pressed " .. n .. " buttons")
	end
	check(stages.Wall_1.CanCollide == false and stages.Wall_9.CanCollide == false, "all walls open at stage 9")
	-- targeted: open a window from its menu button, press its buttons (twice, so confirm-taps also fire)
	local function findButton(text)
		for _, inst in gui:GetDescendants() do
			if R(inst).class == "TextButton" and inst.Text == text then return inst end
		end
	end
	local function pressWindow(menuText, windowTitle, tabs)
		local frame = gui:FindFirstChild("Window_" .. windowTitle)
		for _, tab in (tabs or { false }) do
			if not frame.Visible then findButton(menuText).Activated:Fire(); run(0.1) end
			if tab then findButton(tab).Activated:Fire(); run(0.1) end
			for round = 1, 2 do
				local list = {}
				for _, inst in frame:GetDescendants() do
					if R(inst).class == "TextButton" then table.insert(list, inst) end
				end
				for _, b in list do
					if R(b).parent and b.Text ~= "X" and not (tabs and table.find(tabs, b.Text)) then b.Activated:Fire(); run(0.03) end
				end
			end
		end
	end
	ev.State.OnClientEvent:Fire(snapshot({ stage = 3 }))
	run(0.3)
	pressWindow("Shop", "Shop", { "Passes", "Boosts", "Packs" })
	ev.State.OnClientEvent:Fire(snapshot({ stage = 3, rebirths = 0 }))
	run(0.3)
	pressWindow("Rebirth", "Rebirth")
	pressWindow("Odds", "Drop Chances", { "World 1", "World 2", "World 3" })
	check(fired.BuyPass ~= nil and fired.UsePotion ~= nil and fired.Rebirth ~= nil, "shop / potion / rebirth buttons send requests")
	check(fired.PlaceCard ~= nil and fired.Sell ~= nil and fired.BuyDamage ~= nil and fired.BuyPass ~= nil and fired.BuyProduct ~= nil, "UI sent card / sell / upgrade / shop requests")
	check(fired.ClaimOffline ~= nil and fired.Rebirth ~= nil and fired.TeleportTo ~= nil and fired.UsePotion ~= nil, "UI sent offline / rebirth / teleport / potion requests")
	check(fired.EquipCard ~= nil and fired.LevelUp ~= nil, "UI sent sword / level-up requests")

	me:SetAttribute("IsVip", true)
	run(0.2)
	-- VIP door and wall opening follow the state
	check(door.CanCollide == false, "VIP door open for a VIP")
	ev.State.OnClientEvent:Fire(snapshot({ stage = 2 }))
	run(0.3)
	check(stages.Wall_3.CanCollide == true and stages.Wall_2.CanCollide == false, "wall 3 closed at stage 2")

	print("---- client scenario finished; problems: " .. #errors)
	ctx.finished = true
end)

for _ = 1, 9000 do
	if ctx.finished then break end
	advance(1 / 30)
	heartbeat:Fire(1 / 30)
end
if not ctx.finished then note("TIMEOUT", "scenario did not finish") end
print("TOTAL PROBLEMS:", #errors)
for _, e in errors do print(e) end
