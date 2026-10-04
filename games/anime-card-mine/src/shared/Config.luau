--!strict
-- Main game numbers. Everything balance-related lives here or in Zones/Cards.
local Config = {
	GAME_NAME = "Anime Card Mine",

	-- Saving
	DATASTORE_NAME = "AnimeCardMine_v1",
	AUTOSAVE_SECONDS = 75,
	LOCK_TIMEOUT = 600, -- seconds before a stale session lock is ignored
	LOAD_RETRIES = 3,
	MAX_MONEY = 1e15,

	-- Hitting
	BASE_DAMAGE = 1,
	DAMAGE_PER_LEVEL = 1, -- "+1 Damage per click"
	DAMAGE_COST_BASE = 10,
	DAMAGE_COST_GROWTH = 1.05,
	MAX_DAMAGE_LEVEL = 1000,
	HIT_RANGE = 16, -- studs from the rock surface
	HIT_BUCKET_CAPACITY = 4, -- anti-autoclicker: burst
	HIT_REFILL_PER_SEC = 8, -- anti-autoclicker: sustained hits per second
	CLIENT_HIT_INTERVAL = 0.14,
	AUTOCLICK_INTERVAL = 0.5, -- Auto Click pass (stage 2)
	DROP_SHARE_MIN = 0.25, -- min damage share of a rock to get a card roll (killer always rolls)

	-- Base
	START_SLOTS = 6,
	PLOT_MAX_SLOTS = 21, -- physical pedestals per base (18 buyable + 3 from pass)
	SLOT_COSTS = { 1000, 5000, 25000, 100000, 400000, 1500000, 6000000, 25000000, 100000000, 400000000, 1500000000, 5000000000 },
	SELL_PER_INCOME = 15, -- sell price = income/sec * this

	-- Layout
	PLOT_COUNT = 16,
}

return Config
