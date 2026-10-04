--!strict
-- Per-player request limits for RemoteEvents (never trust the client's request rate).
local Players = game:GetService("Players")

local RateLimiter = {}

local lastCall: { [Player]: { [string]: number } } = {}
local buckets: { [Player]: { [string]: { tokens: number, t: number } } } = {}

-- Simple cooldown: at most one call per `interval` seconds per key.
function RateLimiter.allow(player: Player, key: string, interval: number): boolean
	local now = os.clock()
	local mine = lastCall[player]
	if not mine then
		mine = {}
		lastCall[player] = mine
	end
	local prev = mine[key]
	if prev and now - prev < interval then
		return false
	end
	mine[key] = now
	return true
end

-- Token bucket: allows short bursts but a hard sustained rate (anti-autoclicker).
function RateLimiter.bucket(player: Player, key: string, capacity: number, refillPerSec: number): boolean
	local now = os.clock()
	local mine = buckets[player]
	if not mine then
		mine = {}
		buckets[player] = mine
	end
	local b = mine[key]
	if not b then
		b = { tokens = capacity, t = now }
		mine[key] = b
	end
	b.tokens = math.min(capacity, b.tokens + (now - b.t) * refillPerSec)
	b.t = now
	if b.tokens < 1 then
		return false
	end
	b.tokens -= 1
	return true
end

Players.PlayerRemoving:Connect(function(player)
	lastCall[player] = nil
	buckets[player] = nil
end)

return RateLimiter
