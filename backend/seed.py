import sqlite3

DB_PATH = "products.db"

categories = [
    "olive oil",
    "yogurt",
    "bread",
    "cereal",
    "peanut butter",
    "chocolate spread",
]

products = [
    # Olive Oil
    {
        "category": "olive oil",
        "brand": "Kirkland",
        "name": "Kirkland Signature Extra Virgin Olive Oil",
        "size": "2L",
        "price": 17.99,
        "calories": 120,
        "protein": 0,
        "fat": 14,
        "saturated_fat": 2,
        "sugar": 0,
        "sodium": 0,
        "ingredients": "100% extra virgin olive oil",
        "certifications": "non-GMO, extra virgin",
    },
    {
        "category": "olive oil",
        "brand": "Bertolli",
        "name": "Bertolli Extra Virgin Olive Oil",
        "size": "500ml",
        "price": 8.99,
        "calories": 120,
        "protein": 0,
        "fat": 14,
        "saturated_fat": 2,
        "sugar": 0,
        "sodium": 0,
        "ingredients": "extra virgin olive oil",
        "certifications": "extra virgin",
    },
    {
        "category": "olive oil",
        "brand": "California Olive Ranch",
        "name": "California Olive Ranch 100% California EVOO",
        "size": "500ml",
        "price": 11.99,
        "calories": 120,
        "protein": 0,
        "fat": 14,
        "saturated_fat": 2,
        "sugar": 0,
        "sodium": 0,
        "ingredients": "100% California extra virgin olive oil",
        "certifications": "non-GMO, California Olive Oil Council certified",
    },
    # Yogurt
    {
        "category": "yogurt",
        "brand": "Chobani",
        "name": "Chobani Plain Non-Fat Greek Yogurt",
        "size": "32oz",
        "price": 5.99,
        "calories": 80,
        "protein": 14,
        "fat": 0,
        "saturated_fat": 0,
        "sugar": 6,
        "sodium": 55,
        "ingredients": "skim milk, live and active cultures",
        "certifications": "non-GMO",
    },
    {
        "category": "yogurt",
        "brand": "Fage",
        "name": "Fage Total 0% Plain Greek Yogurt",
        "size": "35.3oz",
        "price": 6.49,
        "calories": 80,
        "protein": 14,
        "fat": 0,
        "saturated_fat": 0,
        "sugar": 5,
        "sodium": 50,
        "ingredients": "pasteurized skimmed milk, live active yogurt cultures",
        "certifications": "gluten-free",
    },
    {
        "category": "yogurt",
        "brand": "Dannon",
        "name": "Dannon Oikos Triple Zero Plain Greek Yogurt",
        "size": "32oz",
        "price": 5.49,
        "calories": 90,
        "protein": 15,
        "fat": 0,
        "saturated_fat": 0,
        "sugar": 0,
        "sodium": 65,
        "ingredients": "cultured grade A non-fat milk, chicory root fiber, stevia leaf extract",
        "certifications": "gluten-free",
    },
    # Bread
    {
        "category": "bread",
        "brand": "Dave's Killer Bread",
        "name": "Dave's Killer Bread 21 Whole Grains and Seeds",
        "size": "27oz",
        "price": 6.49,
        "calories": 120,
        "protein": 5,
        "fat": 2.5,
        "saturated_fat": 0,
        "sugar": 5,
        "sodium": 160,
        "ingredients": "whole wheat flour, water, oats, millet, rye, sunflower seeds, flaxseeds",
        "certifications": "USDA organic, non-GMO",
    },
    {
        "category": "bread",
        "brand": "Wonder",
        "name": "Wonder Classic White Bread",
        "size": "20oz",
        "price": 3.99,
        "calories": 130,
        "protein": 4,
        "fat": 1.5,
        "saturated_fat": 0,
        "sugar": 3,
        "sodium": 230,
        "ingredients": "enriched flour, water, high fructose corn syrup, yeast",
        "certifications": "",
    },
    {
        "category": "bread",
        "brand": "Nature's Own",
        "name": "Nature's Own Honey Wheat Bread",
        "size": "20oz",
        "price": 4.29,
        "calories": 120,
        "protein": 4,
        "fat": 1.5,
        "saturated_fat": 0,
        "sugar": 4,
        "sodium": 170,
        "ingredients": "whole wheat flour, water, honey, yeast, wheat gluten",
        "certifications": "no artificial preservatives",
    },
    # Cereal
    {
        "category": "cereal",
        "brand": "Quaker",
        "name": "Quaker Old Fashioned Oats",
        "size": "42oz",
        "price": 6.99,
        "calories": 150,
        "protein": 5,
        "fat": 3,
        "saturated_fat": 0.5,
        "sugar": 1,
        "sodium": 0,
        "ingredients": "100% whole grain rolled oats",
        "certifications": "whole grain",
    },
    {
        "category": "cereal",
        "brand": "General Mills",
        "name": "Cheerios Original",
        "size": "18oz",
        "price": 5.49,
        "calories": 100,
        "protein": 3,
        "fat": 2,
        "saturated_fat": 0,
        "sugar": 1,
        "sodium": 140,
        "ingredients": "whole grain oats, modified corn starch, sugar, salt",
        "certifications": "whole grain, gluten-free",
    },
    {
        "category": "cereal",
        "brand": "Kellogg's",
        "name": "Kellogg's Special K Original",
        "size": "18oz",
        "price": 5.29,
        "calories": 120,
        "protein": 7,
        "fat": 0.5,
        "saturated_fat": 0,
        "sugar": 4,
        "sodium": 220,
        "ingredients": "rice, wheat gluten, sugar, defatted wheat germ, salt",
        "certifications": "",
    },
    # Peanut Butter
    {
        "category": "peanut butter",
        "brand": "Jif",
        "name": "Jif Creamy Peanut Butter",
        "size": "40oz",
        "price": 8.99,
        "calories": 190,
        "protein": 7,
        "fat": 16,
        "saturated_fat": 3,
        "sugar": 3,
        "sodium": 140,
        "ingredients": "roasted peanuts, sugar, molasses, fully hydrogenated vegetable oils, salt",
        "certifications": "",
    },
    {
        "category": "peanut butter",
        "brand": "Skippy",
        "name": "Skippy Natural Creamy Peanut Butter",
        "size": "40oz",
        "price": 8.49,
        "calories": 190,
        "protein": 7,
        "fat": 16,
        "saturated_fat": 3,
        "sugar": 3,
        "sodium": 110,
        "ingredients": "roasted peanuts, sugar, palm oil, salt",
        "certifications": "no artificial preservatives",
    },
    {
        "category": "peanut butter",
        "brand": "Justin's",
        "name": "Justin's Classic Peanut Butter",
        "size": "16oz",
        "price": 9.99,
        "calories": 190,
        "protein": 7,
        "fat": 16,
        "saturated_fat": 2.5,
        "sugar": 1,
        "sodium": 95,
        "ingredients": "dry roasted peanuts, palm oil",
        "certifications": "non-GMO, gluten-free, kosher",
    },
    # Chocolate Spread
    {
        "category": "chocolate spread",
        "brand": "Great Value",
        "name": "Great Value Hazelnut Spread",
        "size": "26.5oz",
        "price": 4.47,
        "calories": 200,
        "protein": 2,
        "fat": 11,
        "saturated_fat": 2,
        "sugar": 22,
        "sodium": 15,
        "ingredients": "sugar, palm oil, hazelnuts, cocoa, skim milk, reduced minerals whey, soy lecithin, vanillin",
        "certifications": "",
    },
]


def seed():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    with open("schema.sql") as f:
        conn.executescript(f.read())

    for cat in categories:
        cur.execute(
            "INSERT OR IGNORE INTO categories (name) VALUES (?)", (cat,)
        )

    for p in products:
        cur.execute("SELECT id FROM categories WHERE name = ?", (p["category"],))
        category_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT OR IGNORE INTO products
            (category_id, brand, name, size, price, calories, protein, fat,
             saturated_fat, sugar, sodium, ingredients, certifications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                category_id, p["brand"], p["name"], p["size"], p["price"],
                p["calories"], p["protein"], p["fat"], p["saturated_fat"],
                p["sugar"], p["sodium"], p["ingredients"], p["certifications"],
            ),
        )

    conn.commit()
    conn.close()
    print(f"Seeded {len(products)} products across {len(categories)} categories.")


if __name__ == "__main__":
    seed()
