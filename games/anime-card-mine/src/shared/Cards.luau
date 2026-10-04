--!strict
-- All characters are ORIGINAL (invented names, no real anime IP).
-- income = money per second while placed on a base slot.
local Config = require(script.Parent.Config)

export type CardDef = {
	id: string,
	name: string,
	grade: string,
	income: number,
	color: Color3, -- accent (hair / outfit color of the placeholder icon)
	tagline: string,
}

local Cards = {}

local function c(id: string, name: string, grade: string, income: number, r: number, g: number, b: number, tagline: string): CardDef
	return { id = id, name = name, grade = grade, income = income, color = Color3.fromRGB(r, g, b), tagline = tagline }
end

Cards.list = {
	-- Common
	c("mochi_sprout", "Mochi Sprout", "Common", 1, 150, 230, 160, "Grows where it is stepped on."),
	c("pip_tinkerfox", "Pip Tinkerfox", "Common", 2, 255, 170, 90, "Fixes things. Sometimes breaks them first."),
	c("tula_breeze", "Tula Breeze", "Common", 3, 140, 220, 255, "Never walks, always drifts."),
	c("bunbun_knight", "Bunbun Knight", "Common", 4, 255, 200, 220, "Guards the carrot vault."),
	c("nimi_dewdrop", "Nimi Dewdrop", "Common", 5, 120, 200, 240, "Collects morning dew in a teacup."),
	-- Rare
	c("velka_stormwhisk", "Velka Stormwhisk", "Rare", 14, 120, 150, 255, "Bakes thunderstorms into cupcakes."),
	c("kodo_ironpetal", "Kodo Ironpetal", "Rare", 20, 200, 120, 160, "A flower with a steel temper."),
	c("yuzu_nightbloom", "Yuzu Nightbloom", "Rare", 28, 255, 225, 90, "Only opens at midnight."),
	c("mira_gearwing", "Mira Gearwing", "Rare", 36, 230, 150, 70, "Clockwork wings, tireless heart."),
	-- Epic
	c("zephyra_skyloom", "Zephyra Skyloom", "Epic", 110, 100, 230, 230, "Weaves wind into banners."),
	c("toru_emberfang", "Toru Emberfang", "Epic", 170, 255, 110, 60, "Burns bright, bows politely."),
	c("lunette_vale", "Lunette Vale", "Epic", 240, 190, 140, 255, "Moon archivist of forgotten songs."),
	-- Legendary
	c("aurelia_starforge", "Aurelia Starforge", "Legendary", 900, 255, 215, 90, "Hammers new stars on her anvil."),
	c("sorrel_dawnblade", "Sorrel Dawnblade", "Legendary", 1400, 255, 150, 120, "The first light of every battle."),
	-- Mythic
	c("nyx_eternalis", "Nyx Eternalis", "Mythic", 9000, 170, 70, 220, "Keeper of the last night."),
	c("hikari_omniveil", "Hikari Omniveil", "Mythic", 14000, 255, 240, 200, "Veils every world in gentle light."),
	-- Secret
	c("nullia_unwritten", "Nullia the Unwritten", "Secret", 120000, 235, 235, 245, "A character the story forgot to finish."),
	c("omega_inkling", "Omega Inkling", "Secret", 250000, 60, 255, 230, "Last drop of ink in the cosmic pen."),
} :: { CardDef }

Cards.byId = {} :: { [string]: CardDef }
Cards.byGrade = {} :: { [string]: { CardDef } }

for _, def in Cards.list do
	Cards.byId[def.id] = def
	local bucket = Cards.byGrade[def.grade]
	if not bucket then
		bucket = {}
		Cards.byGrade[def.grade] = bucket
	end
	table.insert(bucket, def)
end

function Cards.sellValue(id: string): number
	local def = Cards.byId[id]
	return def and def.income * Config.SELL_PER_INCOME or 0
end

function Cards.initials(def: CardDef): string
	local out = ""
	for word in def.name:gmatch("%a+") do
		if word ~= "the" and #out < 2 then
			out ..= word:sub(1, 1):upper()
		end
	end
	return out
end

return Cards
