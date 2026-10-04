-- ===== Fake Roblox runtime for logic / property checks (not part of the game) =====
local CLASSDATA = [==[__CLASSDATA__]==]
local ENUMDATA = [==[__ENUMDATA__]==]

local function typeof(x)
	local t = type(x)
	if t == "table" then
		local mt = getmetatable(x)
		if type(mt) == "table" and rawget(mt, "__type") then return rawget(mt, "__type") end
	end
	return t
end
local now = 0
local ctx = { isServer = true, closeFns = {}, hooks = {} }
local EPOCH = 1800000000
local os = { clock = function() return now end, time = function() return EPOCH + math.floor(now) end, date = os.date }
local errors = {}
local function note(kind, msg) table.insert(errors, kind .. ": " .. msg); print("!! " .. kind .. ": " .. msg) end

-- ---------- scheduler ----------
local waiting = {}
local function resume(co, ...)
	local ok, err = coroutine.resume(co, ...)
	if not ok then note("RUNTIME ERROR", tostring(err) .. "\n" .. debug.traceback(co)) end
end
local task = {}
function task.spawn(f, ...)
	local co = if type(f) == "thread" then f else coroutine.create(f)
	resume(co, ...)
	return co
end
function task.defer(f, ...) return task.delay(0, f, ...) end
function task.delay(t, f, ...)
	local co = if type(f) == "thread" then f else coroutine.create(f)
	table.insert(waiting, { wake = now + t, co = co, args = table.pack(...) })
	return co
end
function task.wait(t)
	local co = coroutine.running()
	local start = now
	table.insert(waiting, { wake = now + (t or 0.03), co = co, args = table.pack() })
	coroutine.yield()
	return now - start
end
function task.cancel(co) for i, w in waiting do if w.co == co then table.remove(waiting, i) return end end end

local heartbeat -- signal, set later
local function advance(dt)
	local target = now + dt
	while true do
		local bi, bw = nil, nil
		for i, w in waiting do
			if w.wake <= target and (not bw or w.wake < bw.wake) then bi, bw = i, w end
		end
		if not bi then break end
		table.remove(waiting, bi)
		now = math.max(now, bw.wake)
		resume(bw.co, table.unpack(bw.args, 1, bw.args.n))
	end
	now = target
end

-- ---------- datatypes ----------
local function mk(name, methods, extra)
	local mt = { __type = name }
	mt.__index = function(t, k)
		local m = methods[k]
		if m ~= nil then return m end
		if extra then return extra(t, k) end
		error(name .. " has no member " .. tostring(k), 2)
	end
	return mt
end

local V3methods = {}
local V3mt
local function V3new(x, y, z) return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, V3mt) end
V3mt = mk("Vector3", V3methods, function(t, k)
	if k == "Magnitude" then return math.sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z) end
	if k == "Unit" then local m = math.sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z); return V3new(t.X / m, t.Y / m, t.Z / m) end
end)
V3mt.__add = function(a, b) return V3new(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
V3mt.__sub = function(a, b) return V3new(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
V3mt.__mul = function(a, b)
	if type(a) == "number" then return V3new(a * b.X, a * b.Y, a * b.Z) end
	if type(b) == "number" then return V3new(a.X * b, a.Y * b, a.Z * b) end
	return V3new(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
V3mt.__div = function(a, b) if type(b) == "number" then return V3new(a.X / b, a.Y / b, a.Z / b) end return V3new(a.X / b.X, a.Y / b.Y, a.Z / b.Z) end
V3mt.__unm = function(a) return V3new(-a.X, -a.Y, -a.Z) end
V3mt.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
V3mt.__tostring = function(a) return string.format("%g, %g, %g", a.X, a.Y, a.Z) end
function V3methods.Dot(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end
function V3methods.Lerp(a, b, t) return a + (b - a) * t end
local Vector3 = { new = V3new, zero = V3new(0, 0, 0), one = V3new(1, 1, 1) }

local V2methods = {}
local V2mt
local function V2new(x, y) return setmetatable({ X = x or 0, Y = y or 0 }, V2mt) end
V2mt = mk("Vector2", V2methods, function(t, k) if k == "Magnitude" then return math.sqrt(t.X * t.X + t.Y * t.Y) end end)
V2mt.__sub = function(a, b) return V2new(a.X - b.X, a.Y - b.Y) end
V2mt.__add = function(a, b) return V2new(a.X + b.X, a.Y + b.Y) end
V2mt.__mul = function(a, b) if type(b) == "number" then return V2new(a.X * b, a.Y * b) end return V2new(a.X * b.X, a.Y * b.Y) end
V2mt.__eq = function(a, b) return a.X == b.X and a.Y == b.Y end
local Vector2 = { new = V2new, zero = V2new(0, 0), one = V2new(1, 1) }

local C3mt
local C3methods = {}
local function C3new(r, g, b) return setmetatable({ R = r or 0, G = g or 0, B = b or 0 }, C3mt) end
C3mt = mk("Color3", C3methods)
C3mt.__eq = function(a, b) return a.R == b.R and a.G == b.G and a.B == b.B end
function C3methods.Lerp(a, b, t) return C3new(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t) end
local Color3 = { new = C3new, fromRGB = function(r, g, b) return C3new(r / 255, g / 255, b / 255) end }

local UDmt = mk("UDim", {})
local function UDnew(s, o) return setmetatable({ Scale = s or 0, Offset = o or 0 }, UDmt) end
local UDim = { new = UDnew }
local U2mt = mk("UDim2", {})
local function U2new(xs, xo, ys, yo)
	if type(xs) == "table" then return setmetatable({ X = xs, Y = xo }, U2mt) end
	return setmetatable({ X = UDnew(xs, xo), Y = UDnew(ys, yo) }, U2mt)
end
local UDim2 = { new = U2new, fromScale = function(x, y) return U2new(x, 0, y, 0) end, fromOffset = function(x, y) return U2new(0, x, 0, y) end }

-- CFrame: position p and 3x3 rotation r (row major)
local CFmethods = {}
local CFmt
local ID = { 1, 0, 0, 0, 1, 0, 0, 0, 1 }
local function CFraw(p, r) return setmetatable({ p = p, r = r }, CFmt) end
local function mulR(a, b)
	local out = {}
	for i = 0, 2 do for j = 0, 2 do
		out[i * 3 + j + 1] = a[i * 3 + 1] * b[j + 1] + a[i * 3 + 2] * b[3 + j + 1] + a[i * 3 + 3] * b[6 + j + 1]
	end end
	return out
end
local function rotV(r, v) return V3new(r[1] * v.X + r[2] * v.Y + r[3] * v.Z, r[4] * v.X + r[5] * v.Y + r[6] * v.Z, r[7] * v.X + r[8] * v.Y + r[9] * v.Z) end
CFmt = mk("CFrame", CFmethods, function(t, k)
	if k == "Position" then return t.p end
	if k == "X" then return t.p.X end
	if k == "Y" then return t.p.Y end
	if k == "Z" then return t.p.Z end
	if k == "LookVector" then return rotV(t.r, V3new(0, 0, -1)) end
	if k == "RightVector" then return rotV(t.r, V3new(1, 0, 0)) end
	if k == "UpVector" then return rotV(t.r, V3new(0, 1, 0)) end
end)
CFmt.__mul = function(a, b)
	if getmetatable(b) == V3mt then return a.p + rotV(a.r, b) end
	return CFraw(a.p + rotV(a.r, b.p), mulR(a.r, b.r))
end
CFmt.__eq = function(a, b) return a.p == b.p end
function CFmethods.Inverse(a) return CFraw(V3new(-a.p.X, -a.p.Y, -a.p.Z), a.r) end
function CFmethods.Lerp(a, b, t) return b end
local CFrame = {}
function CFrame.new(x, y, z)
	if x == nil then return CFraw(V3new(0, 0, 0), ID) end
	if type(x) == "table" then return CFraw(x, ID) end
	return CFraw(V3new(x, y, z), ID)
end
function CFrame.Angles(rx, ry, rz)
	local cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
	local Rx = { 1, 0, 0, 0, cx, -sx, 0, sx, cx }
	local Ry = { cy, 0, sy, 0, 1, 0, -sy, 0, cy }
	local Rz = { cz, -sz, 0, sz, cz, 0, 0, 0, 1 }
	return CFraw(V3new(0, 0, 0), mulR(mulR(Rx, Ry), Rz))
end
function CFrame.lookAt(a, b) return CFraw(a, ID) end

local TweenInfo = { new = function(...) return { args = { ... } } end }
local Ray = { new = function(o, d) return { Origin = o, Direction = d } end }
local RaycastParams = { new = function() return {} end }
local Random = {}
function Random.new(seed)
	if seed then math.randomseed(seed) end
	return {
		NextNumber = function(self, a, b) if a then return a + math.random() * (b - a) end return math.random() end,
		NextInteger = function(self, a, b) return math.random(a, b) end,
	}
end

-- ---------- enums ----------
local enumItems = {}
for line in string.gmatch(ENUMDATA, "[^\n]+") do
	local name, items = string.match(line, "^(%w+)|(.*)$")
	local set = {}
	for item in string.gmatch(items, "[^,]+") do set[item] = true end
	enumItems[name] = set
end
local enumCache = {}
local EnumItemMT = { __type = "EnumItem" }
EnumItemMT.__tostring = function(e) return "Enum." .. e.EnumType .. "." .. e.Name end
local Enum = setmetatable({}, { __index = function(t, ename)
	local set = enumItems[ename]
	if not set then error("Enum." .. tostring(ename) .. " does not exist", 2) end
	local e = setmetatable({}, { __type = "Enum", __index = function(et, iname)
		if not set[iname] then error("Enum." .. ename .. "." .. tostring(iname) .. " does not exist", 2) end
		local item = setmetatable({ Name = iname, EnumType = ename, Value = 0 }, EnumItemMT)
		rawset(et, iname, item)
		return item
	end })
	rawset(t, ename, e)
	return e
end })

-- ---------- signals ----------
local SigMT = { __type = "RBXScriptSignal" }
local ConnMT = { __type = "RBXScriptConnection" }
ConnMT.__index = { Disconnect = function(c) c.Connected = false; c.sig.fns[c.fn] = nil end }
local function newSignal()
	local s = setmetatable({ fns = {}, order = {} }, SigMT)
	return s
end
SigMT.__index = {
	Connect = function(s, fn)
		assert(type(fn) == "function", "Connect expects a function")
		s.fns[fn] = true
		table.insert(s.order, fn)
		return setmetatable({ Connected = true, sig = s, fn = fn }, ConnMT)
	end,
	Once = function(s, fn)
		local c
		c = s:Connect(function(...) c:Disconnect(); fn(...) end)
		return c
	end,
	Wait = function(s)
		local co = coroutine.running()
		local c
		c = s:Connect(function(...) c:Disconnect(); task.spawn(co, ...) end)
		return coroutine.yield()
	end,
	Fire = function(s, ...)
		local list = table.clone(s.order)
		for _, fn in list do
			if s.fns[fn] then
				local co = coroutine.create(fn)
				resume(co, ...)
			end
		end
	end,
}

-- ---------- classes & instances ----------
local classes = {}
for line in string.gmatch(CLASSDATA, "[^\n]+") do
	local parts = string.split(line, "|")
	local c = { name = parts[1], parent = parts[2], creatable = parts[3] == "1", props = {}, methods = {}, events = {} }
	for p in string.gmatch(parts[4] or "", "[^,]+") do local n, t = string.match(p, "^([%w_]+):(.*)$"); c.props[n] = t end
	for m in string.gmatch(parts[5] or "", "[^,]+") do c.methods[m] = true end
	for e in string.gmatch(parts[6] or "", "[^,]+") do c.events[e] = true end
	classes[c.name] = c
end
local function lookup(cls, kind, name)
	local c = classes[cls]
	while c do
		local v = c[kind][name]
		if v ~= nil then return v end
		c = classes[c.parent]
	end
	return nil
end
local function isA(cls, target)
	local c = classes[cls]
	while c do
		if c.name == target then return true end
		c = classes[c.parent]
	end
	return false
end

local function defaultFor(t)
	if t == "number" then return 0 elseif t == "string" then return "" elseif t == "boolean" then return false
	elseif t == "Vector3" then return V3new(0, 0, 0) elseif t == "Vector2" then return V2new(0, 0)
	elseif t == "CFrame" then return CFrame.new() elseif t == "Color3" then return C3new(0, 0, 0)
	elseif t == "UDim2" then return U2new(0, 0, 0, 0) elseif t == "UDim" then return UDnew(0, 0) end
	return nil
end

local function checkType(inst, cls, key, declared, v)
	local optional = string.sub(declared, -1) == "?"
	local t = if optional then string.sub(declared, 1, -2) else declared
	if v == nil then
		if optional or not (t == "number" or t == "string" or t == "boolean") then return end
		error(string.format("bad value nil for %s.%s (%s)", cls, key, declared), 3)
	end
	local ok = true
	if t == "number" or t == "string" or t == "boolean" then ok = type(v) == t
	elseif t == "Vector3" or t == "Vector2" or t == "CFrame" or t == "Color3" or t == "UDim2" or t == "UDim" then ok = typeof(v) == t
	elseif string.sub(t, 1, 4) == "Enum" and enumItems[string.sub(t, 5)] then ok = typeof(v) == "EnumItem" and v.EnumType == string.sub(t, 5)
	elseif t == "ContentId" then ok = type(v) == "string"
	elseif classes[t] then ok = typeof(v) == "Instance" and isA(v.ClassName, t) end
	if not ok then
		error(string.format("bad value %s (%s) for %s.%s (expects %s)", tostring(v), typeof(v), cls, key, declared), 3)
	end
end

local InstMT = { __type = "Instance" }
local raw = setmetatable({}, { __mode = "k" }) -- inst -> internals
local function R(inst) return raw[inst] end

local function descendants(inst, out)
	for _, c in R(inst).children do table.insert(out, c); descendants(c, out) end
	return out
end

local function detach(inst)
	local r = R(inst)
	if r.parent then
		local pr = R(r.parent)
		local i = table.find(pr.children, inst)
		if i then table.remove(pr.children, i) end
		pr.signals.ChildRemoved:Fire(inst)
		r.parent = nil
	end
end

local function setParent(inst, parent)
	local r = R(inst)
	if r.destroyed then error("The Parent property of " .. r.name .. " is locked (destroyed)", 3) end
	if parent ~= nil and typeof(parent) ~= "Instance" then error("Parent must be an Instance or nil", 3) end
	if parent == inst then error("Attempt to set " .. r.name .. " as its own parent", 3) end
	detach(inst)
	if parent then
		r.parent = parent
		local pr = R(parent)
		table.insert(pr.children, inst)
		pr.signals.ChildAdded:Fire(inst)
	end
	r.signals.AncestryChanged:Fire(inst, parent)
end

local Instance = {}
local newInstance

local genericMethods = {}
function genericMethods.FindFirstChild(self, name, recursive)
	local list = if recursive then descendants(self, {}) else R(self).children
	for _, c in list do if R(c).name == name then return c end end
	return nil
end
function genericMethods.FindFirstChildOfClass(self, cls)
	for _, c in R(self).children do if R(c).class == cls then return c end end
	return nil
end
function genericMethods.FindFirstChildWhichIsA(self, cls)
	for _, c in R(self).children do if isA(R(c).class, cls) then return c end end
	return nil
end
function genericMethods.FindFirstAncestorOfClass(self, cls)
	local p = R(self).parent
	while p do if R(p).class == cls then return p end p = R(p).parent end
	return nil
end
function genericMethods.FindFirstAncestor(self, name)
	local p = R(self).parent
	while p do if R(p).name == name then return p end p = R(p).parent end
	return nil
end
function genericMethods.WaitForChild(self, name, timeout)
	local t0 = now
	while true do
		local c = genericMethods.FindFirstChild(self, name)
		if c then return c end
		if timeout and now - t0 >= timeout then return nil end
		if now - t0 > 60 then note("WARN", "WaitForChild(" .. name .. ") on " .. R(self).name .. " waited 60s (infinite yield)"); return nil end
		task.wait(0.1)
	end
end
function genericMethods.GetChildren(self) return table.clone(R(self).children) end
function genericMethods.GetDescendants(self) return descendants(self, {}) end
function genericMethods.IsA(self, cls) return isA(R(self).class, cls) end
function genericMethods.IsDescendantOf(self, other)
	local p = R(self).parent
	while p do if p == other then return true end p = R(p).parent end
	return false
end
function genericMethods.GetFullName(self)
	local parts, p = {}, self
	while p do table.insert(parts, 1, R(p).name); p = R(p).parent end
	return table.concat(parts, ".")
end
function genericMethods.Destroy(self)
	local r = R(self)
	for _, c in table.clone(r.children) do genericMethods.Destroy(c) end
	detach(self)
	r.destroyed = true
	r.signals.Destroying:Fire()
end
function genericMethods.ClearAllChildren(self) for _, c in table.clone(R(self).children) do genericMethods.Destroy(c) end end
function genericMethods.SetAttribute(self, k, v)
	local r = R(self)
	assert(type(k) == "string", "attribute name must be a string")
	if v ~= nil then
		local t = typeof(v)
		assert(t == "number" or t == "string" or t == "boolean" or t == "Vector3" or t == "Color3" or t == "UDim2" or t == "CFrame" or t == "Vector2", "bad attribute type " .. t)
	end
	r.attrs[k] = v
	r.signals.Changed:Fire(k)
	if r.attrSignals[k] then r.attrSignals[k]:Fire() end
end
function genericMethods.GetAttribute(self, k) return R(self).attrs[k] end
function genericMethods.GetAttributes(self) return table.clone(R(self).attrs) end
function genericMethods.GetAttributeChangedSignal(self, k)
	local r = R(self)
	if not r.attrSignals[k] then r.attrSignals[k] = newSignal() end
	return r.attrSignals[k]
end
function genericMethods.GetPropertyChangedSignal(self, k)
	local r = R(self)
	r.propSignals[k] = r.propSignals[k] or newSignal()
	return r.propSignals[k]
end
function genericMethods.Clone(self)
	local r = R(self)
	local c = newInstance(r.class)
	local cr = R(c)
	for k, v in r.props do cr.props[k] = v end
	for k, v in r.attrs do cr.attrs[k] = v end
	cr.name = r.name
	for _, ch in r.children do setParent(genericMethods.Clone(ch), c) end
	return c
end

InstMT.__index = function(self, key)
	local r = raw[self]
	if key == "Name" then return r.name end
	if key == "ClassName" then return r.class end
	if key == "Parent" then return r.parent end
	if r.special and r.special[key] ~= nil then return r.special[key] end
	local gm = genericMethods[key]
	if gm then return gm end
	if r.signals[key] then return r.signals[key] end
	if lookup(r.class, "events", key) then
		r.signals[key] = newSignal()
		return r.signals[key]
	end
	local pt = lookup(r.class, "props", key)
	if pt then
		local v = r.props[key]
		if v == nil then
			v = defaultFor(pt)
			if v ~= nil then r.props[key] = v end
		end
		return v
	end
	if lookup(r.class, "methods", key) then
		local impl = r.methods[key]
		if impl then return impl end
		return function() error("MOCK: method " .. r.class .. ":" .. key .. " is not implemented in the fake runtime", 2) end
	end
	local child = genericMethods.FindFirstChild(self, key)
	if child then return child end
	error(string.format("%s is not a valid member of %s \"%s\"", tostring(key), r.class, genericMethods.GetFullName(self)), 2)
end

InstMT.__newindex = function(self, key, value)
	local r = raw[self]
	if key == "Name" then r.name = value; return end
	if key == "Parent" then setParent(self, value); return end
	local pt = lookup(r.class, "props", key)
	if not pt then
		error(string.format("%s is not a valid member of %s (cannot set)", tostring(key), r.class), 2)
	end
	checkType(self, r.class, key, pt, value)
	r.props[key] = value
	if key == "CFrame" and value ~= nil then r.props.Position = value.p end
	if key == "Position" then r.props.CFrame = CFrame.new(value) end
	r.signals.Changed:Fire(key)
	if r.propSignals[key] then r.propSignals[key]:Fire() end
end
InstMT.__tostring = function(self) return raw[self].name end

newInstance = function(className, parent)
	local c = classes[className]
	if not c then error("Unable to create an Instance of type \"" .. tostring(className) .. "\"", 3) end
	if not c.creatable then error("Unable to create an Instance of type \"" .. className .. "\" (not creatable)", 3) end
	local inst = setmetatable({}, InstMT)
	raw[inst] = {
		class = className, name = className, parent = nil, children = {}, props = {}, attrs = {}, attrSignals = {}, propSignals = {},
		signals = { ChildAdded = newSignal(), ChildRemoved = newSignal(), AncestryChanged = newSignal(), Destroying = newSignal(), Changed = newSignal() },
		methods = {}, special = nil,
	}
	local r = raw[inst]
	if className == "Part" or className == "SpawnLocation" or className == "MeshPart" then
		r.props.Size = V3new(4, 1, 2)
	end
	if className == "BindableEvent" then
		r.special = { Event = newSignal() }
		r.methods.Fire = function(self, ...) R(self).special.Event:Fire(...) end
	end
	if className == "RemoteEvent" then
		r.special = { OnServerEvent = newSignal(), OnClientEvent = newSignal() }
		r.methods.FireServer = function(self, ...) if ctx.hooks.remote then ctx.hooks.remote("server", self, nil, ...) end end
		r.methods.FireClient = function(self, player, ...) if ctx.hooks.remote then ctx.hooks.remote("client", self, player, ...) end end
	end
	if className == "Humanoid" then
		r.props.Health = 100
		r.methods.EquipTool = function(self, tool) tool.Parent = R(self).parent end
	end
	if className == "Player" then
		r.methods.Kick = function(self, msg) R(self).kicked = msg or true end
	end
	if className == "Tween" then
		r.methods.Play = function() end
	end
	if parent then setParent(inst, parent) end
	return inst
end
Instance.new = function(className, parent) return newInstance(className, parent) end

-- ---------- services ----------
local services = {}
local game = newInstance("Folder")
game.Name = "game"
local function addService(name, inst)
	inst.Name = name
	inst.Parent = game
	services[name] = inst
	return inst
end
local function serviceInstance(name, class)
	local s = newInstance(class or "Folder")
	addService(name, s)
	return s
end

local workspace = serviceInstance("Workspace", "Workspace")
local ReplicatedStorage = serviceInstance("ReplicatedStorage", "ReplicatedStorage")
local ServerScriptService = serviceInstance("ServerScriptService", "ServerScriptService")
local Lighting = serviceInstance("Lighting", "Lighting")
local StarterPlayer = serviceInstance("StarterPlayer", "StarterPlayer")
local StarterPlayerScripts = newInstance("Folder", StarterPlayer); StarterPlayerScripts.Name = "StarterPlayerScripts"

-- Workspace needs the class members the game uses
raw[workspace].methods.Raycast = function() return nil end
raw[workspace].methods.GetServerTimeNow = function() return EPOCH + now end
raw[workspace].props.CurrentCamera = nil

-- tables used as services (not Instances)
local function plainService(name, t) services[name] = t; return t end
local RunService = plainService("RunService", { IsServer = function() return ctx.isServer end, IsClient = function() return not ctx.isServer end, IsStudio = function() return true end })
heartbeat = newSignal()
RunService.Heartbeat = heartbeat
RunService.RenderStepped = heartbeat

local Players = serviceInstance("Players", "Players")
raw[Players].special = {
	PlayerAdded = newSignal(), PlayerRemoving = newSignal(), LocalPlayer = nil,
	GetPlayers = function(self) local out = {} for _, c in R(self).children do if R(c).class == "Player" then table.insert(out, c) end end return out end,
	GetPlayerByUserId = function(self, id) for _, c in R(self).children do if R(c).class == "Player" and R(c).props.UserId == id then return c end end return nil end,
}

local TweenService = plainService("TweenService", {})
function TweenService:Create(inst, info, props)
	for k, v in props do inst[k] = v end -- apply instantly (also validates property names / types)
	return { Play = function() end, Cancel = function() end }
end
local Debris = plainService("Debris", {})
function Debris:AddItem(inst, t) task.delay(t, function() if inst.Parent then inst:Destroy() end end) end

local UserInputService = plainService("UserInputService", { TouchEnabled = false, InputBegan = newSignal(), InputEnded = newSignal(), InputChanged = newSignal() })
function UserInputService:GetMouseLocation() return V2new(400, 300) end

local DS = { mode = "ok", db = {}, calls = 0 }
local function jsonCheck(v, path)
	local t = type(v)
	if t == "number" or t == "string" or t == "boolean" then return end
	if t ~= "table" then error("DataStore: cannot serialize " .. t .. " at " .. path) end
	if getmetatable(v) ~= nil then error("DataStore: cannot serialize datatype at " .. path) end
	local n, isArray = 0, true
	for k in v do
		n += 1
		if type(k) ~= "string" and type(k) ~= "number" then error("DataStore: bad key type at " .. path) end
		if type(k) == "string" then isArray = false end
		jsonCheck(v[k], path .. "." .. tostring(k))
	end
	if not isArray then for k in v do if type(k) == "number" then error("DataStore: mixed keys at " .. path) end end end
end
local function deepcopy(v) if type(v) ~= "table" then return v end local o = {} for k, x in v do o[k] = deepcopy(x) end return o end
local DataStoreService = plainService("DataStoreService", {})
function DataStoreService:GetDataStore(name)
	return { UpdateAsync = function(self, key, fn)
		DS.calls += 1
		if DS.mode == "error" then error("StudioAccessToApisNotAllowed (mock)") end
		local old = deepcopy(DS.db[key])
		local new = fn(old)
		if new == nil then return old end
		jsonCheck(new, key)
		DS.db[key] = deepcopy(new)
		return new
	end }
end

local MarketplaceService = plainService("MarketplaceService", { ProcessReceipt = nil, prompts = {}, PromptGamePassPurchaseFinished = newSignal() })
function MarketplaceService:UserOwnsGamePassAsync(userId, id) return false end
function MarketplaceService:PromptProductPurchase(player, id) table.insert(self.prompts, "product:" .. id) end
function MarketplaceService:PromptGamePassPurchase(player, id) table.insert(self.prompts, "pass:" .. id) end

raw[game].special = { JobId = "job-1", BindToClose = function(self, fn) table.insert(ctx.closeFns, fn) end, GetService = function(self, name)
	local s = services[name]
	if not s then error("MOCK: service " .. name .. " is not available in the fake runtime", 2) end
	return s
end }

-- script objects for modules
local function newModule(parent, name, fn, class)
	local m = newInstance(class or "ModuleScript")
	m.Name = name
	m.Parent = parent
	raw[m].fn = fn
	return m
end
local moduleCache = {}
local function require(m)
	assert(typeof(m) == "Instance" and R(m).fn, "require expects a ModuleScript")
	assert(R(m).class == "ModuleScript", "require expects a ModuleScript, got " .. R(m).class)
	if moduleCache[m] ~= nil then return moduleCache[m].v end
	local entry = { v = nil }
	moduleCache[m] = entry
	entry.v = R(m).fn(m)
	return entry.v
end

local function newPlayer(name, userId)
	local p = newInstance("Player")
	p.Name = name
	raw[p].props.UserId = userId
	raw[p].props.DisplayName = name
	local backpack = newInstance("Folder", p); backpack.Name = "Backpack"
	p.Parent = Players
	return p
end
local function spawnCharacter(p, pos)
	local char = newInstance("Model")
	char.Name = p.Name
	local hrp = newInstance("Part", char); hrp.Name = "HumanoidRootPart"; hrp.Position = pos or V3new(0, 4, 0); hrp.CFrame = CFrame.new(pos or V3new(0, 4, 0))
	local head = newInstance("Part", char); head.Name = "Head"
	local hum = newInstance("Humanoid", char)
	char.Parent = workspace
	p.Character = char
	if p.CharacterAdded then p.CharacterAdded:Fire(char) end
	return char
end
local function placeCharacter(p, pos)
	local hrp = p.Character.HumanoidRootPart
	hrp.Position = pos
	hrp.CFrame = CFrame.new(pos)
end
-- keep Position and CFrame in sync like the real engine

local function warn(...) print("WARN:", ...) end
local function check(cond, msg) if not cond then note("CHECK FAILED", msg) else print("ok  " .. msg) end end
local function run(seconds)
	local steps = math.floor(seconds * 30)
	for _ = 1, steps do
		advance(1 / 30)
		heartbeat:Fire(1 / 30)
	end
end
