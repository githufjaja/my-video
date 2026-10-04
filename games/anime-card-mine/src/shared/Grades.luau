--!strict
-- Card grades (rarities).
export type GradeInfo = {
	name: string,
	order: number,
	color: Color3, -- frame color
	back: Color3, -- card background
}

local Grades = {}

Grades.list = { "Common", "Rare", "Epic", "Legendary", "Mythic", "Secret" }

Grades.info = {
	Common = { name = "Common", order = 1, color = Color3.fromRGB(190, 195, 205), back = Color3.fromRGB(52, 55, 66) },
	Rare = { name = "Rare", order = 2, color = Color3.fromRGB(70, 150, 255), back = Color3.fromRGB(26, 44, 78) },
	Epic = { name = "Epic", order = 3, color = Color3.fromRGB(180, 90, 255), back = Color3.fromRGB(48, 28, 80) },
	Legendary = { name = "Legendary", order = 4, color = Color3.fromRGB(255, 176, 30), back = Color3.fromRGB(80, 54, 14) },
	Mythic = { name = "Mythic", order = 5, color = Color3.fromRGB(255, 70, 110), back = Color3.fromRGB(84, 20, 40) },
	Secret = { name = "Secret", order = 6, color = Color3.fromRGB(40, 255, 225), back = Color3.fromRGB(10, 12, 18) },
} :: { [string]: GradeInfo }

function Grades.isGrade(name: any): boolean
	return type(name) == "string" and Grades.info[name] ~= nil
end

return Grades
