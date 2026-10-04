--!strict
-- Main game numbers. Balance lives here and in Zones / Cards / Monetization.
local Config = {
	GAME_NAME = "Anime Card Mine",

	-- Saving
	DATASTORE_NAME = "AnimeCardMine_v1", -- same store as v1; profile.v inside tells the version (migration in DataService)
	PROFILE_VERSION = 2,
	AUTOSAVE_SECONDS = 75,
	LOCK_TIMEOUT = 600, -- seconds before a stale session lock is ignored
	LOAD_RETRIES = 3,
	MAX_MONEY = 1e15,

	-- Sword / hitting
	BASE_DAMAGE = 1,
	DAMAGE_COST_BASE = 10,
	DAMAGE_COST_GROWTH = 1.05,
	MAX_DAMAGE_LEVEL = 1000,
	HIT_RANGE = 16, -- studs from the obstacle surface
	WALL_RANGE = 14,
	HIT_BUCKET_CAPACITY = 4, -- anti-autoclicker: burst
	HIT_REFILL_PER_SEC = 8, -- anti-autoclicker: sustained hits per second
	CLIENT_HIT_INTERVAL = 0.14,
	AUTOSWING_INTERVAL = 0.5, -- Auto Swing pass
	DROP_SHARE_MIN = 0.25, -- (rocks are shared) min damage share to be paid when a rock breaks; killer always paid

	-- Card drops (personal, every N seconds)
	DROP_INTERVAL = 90,
	DROP_INTERVAL_FAST = 60, -- "Faster Drops" pass
	DROP_FIRST_DELAY = 25, -- first drop after joining
	DROP_LIFETIME = 60,
	DROP_PICKUP_RADIUS = 8, -- client touch radius
	DROP_PICKUP_SERVER = 20, -- server accepts a pickup within this distance (latency margin)
	DROP_MAX_ACTIVE = 3,

	-- Cards
	CARD_MAX_LEVEL = 10,
	SELL_PER_INCOME = 15, -- sell price = income/sec * this
	SWORD_START_SLOTS = 1,
	SWORD_SLOT_COSTS = { 250000, 25000000 }, -- buy slot 2, slot 3
	SWORD_MAX_SLOTS = 5, -- 3 buyable + 2 from pass

	-- Base
	START_SLOTS = 6,
	PLOT_MAX_SLOTS = 21, -- physical pedestals per base (18 buyable + 3 from pass)
	SLOT_COSTS = { 1000, 5000, 25000, 100000, 400000, 1500000, 6000000, 25000000, 100000000, 400000000, 1500000000, 5000000000 },
	PLOT_COUNT = 16,

	-- Offline reward
	OFFLINE_MAX_HOURS = 4,
	OFFLINE_RATE = 0.5, -- share of normal income earned while away
	OFFLINE_MIN_SECONDS = 120,

	-- Rebirth
	REBIRTH_BASE_STAGE = 3, -- stages to clear for the first rebirth
	REBIRTH_STAGE_STEP = 2, -- +N stages required per rebirth already done
	REBIRTH_DAMAGE_PER = 0.5, -- +50% damage per rebirth
	REBIRTH_MONEY_PER = 0.25, -- +25% money per rebirth
	REBIRTH_MAX = 100,
}

return Config
