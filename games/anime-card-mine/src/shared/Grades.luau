--!strict
-- Card grades (rarities).
export type GradeInfo = {
	name: string,
	order: number,
	color: Color3, -- frame color
	back: Color3, -- card background
	swordDmg: number, -- damage bonus (fraction) when equipped in a sword slot (level 1)
	swordMoney: number, -- money bonus (fraction) when equipped in a sword slot (level 1)
}

local Grades = {}

Grades.list = { "Common", "Rare", "Epic", "Legendary", "Mythic", "Secret" }

Grades.info = {
	Common = { name = "Common", order = 1, color = Color3.fromRGB(190, 195, 205), back = Color3.fromRGB(52, 55, 66), swordDmg = 0.03, swordMoney = 0.015 },
	Rare = { name = "Rare", order = 2, color = Color3.fromRGB(70, 150, 255), back = Color3.fromRGB(26, 44, 78), swordDmg = 0.08, swordMoney = 0.04 },
	Epic = { name = "Epic", order = 3, color = Color3.fromRGB(180, 90, 255), back = Color3.fromRGB(48, 28, 80), swordDmg = 0.2, swordMoney = 0.1 },
	Legendary = { name = "Legendary", order = 4, color = Color3.fromRGB(255, 176, 30), back = Color3.fromRGB(80, 54, 14), swordDmg = 0.5, swordMoney = 0.25 },
	Mythic = { name = "Mythic", order = 5, color = Color3.fromRGB(255, 70, 110), back = Color3.fromRGB(84, 20, 40), swordDmg = 1.2, swordMoney = 0.6 },
	Secret = { name = "Secret", order = 6, color = Color3.fromRGB(40, 255, 225), back = Color3.fromRGB(10, 12, 18), swordDmg = 3.0, swordMoney = 1.5 },
} :: { [string]: GradeInfo }

function Grades.isGrade(name: any): boolean
	return type(name) == "string" and Grades.info[name] ~= nil
end

return Grades
