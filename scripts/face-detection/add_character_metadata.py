#!/usr/bin/env python3
"""
Add names and descriptions to all detected characters.
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
CHARS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "characters.json"

# Character metadata based on visual inspection of representative frames
CHARACTER_METADATA = {
    "char_001": {
        "name": "Phantom Flame",
        "description": "Abstract red smoke/flame visual - likely a false positive from fire/smoke effects rather than a person",
        "tags": ["abstract", "flame", "false_positive"]
    },
    "char_002": {
        "name": "Mei",
        "description": "East Asian woman with shoulder-length black hair, wearing a white blouse, modern interior setting with stone wall",
        "tags": ["woman", "asian", "professional"]
    },
    "char_003": {
        "name": "Sagittarius Sketch",
        "description": "Line art illustration of a centaur archer with curly hair, bow and quiver, ornate art nouveau frame",
        "tags": ["illustration", "centaur", "sagittarius", "line_art"]
    },
    "char_004": {
        "name": "Chiron",
        "description": "Photorealistic centaur with brown horse body, human torso in green vest and cream shirt, wavy brown hair, bow and arrows, forest setting",
        "tags": ["centaur", "archer", "sagittarius", "fantasy"]
    },
    "char_005": {
        "name": "Archer",
        "description": "Young man with curly red hair, warm smile, Sagittarius text overlay, cheerful demeanor",
        "tags": ["man", "redhead", "sagittarius", "young"]
    },
    "char_006": {
        "name": "Dusty",
        "description": "Middle-aged man with long wavy brown/grey hair, olive jacket over tan shirt, rugged appearance, standing on road through golden fields",
        "tags": ["man", "middle_aged", "rugged", "traveler"]
    },
    "char_007": {
        "name": "The Wanderer",
        "description": "Solitary man standing on straight road through wheat fields, ghostly face apparition in sky above, surreal/dreamlike quality",
        "tags": ["man", "surreal", "ghost", "fields"]
    },
    "char_008": {
        "name": "Ruby",
        "description": "Elegant Black woman with curly hair, red wrap dress, walking through a sunlit garden at golden hour",
        "tags": ["woman", "black", "elegant", "garden"]
    },
    "char_009": {
        "name": "The Caller",
        "description": "Split-screen composition: young person with curly hair holding phone (orange lighting) and blonde woman (blue lighting) - telephone conversation scene",
        "tags": ["split_screen", "phone", "dramatic_lighting"]
    },
    "char_010": {
        "name": "Phone Girl",
        "description": "Same split-screen phone call scene - blonde woman in blue-tinted frame, appears contemplative",
        "tags": ["woman", "blonde", "phone", "dramatic_lighting"]
    },
    "char_011": {
        "name": "Elena",
        "description": "Professional Latina woman with dark hair in a sleek bun, navy blazer over white blouse, standing in elevator, confident smile",
        "tags": ["woman", "latina", "professional", "elevator"]
    },
    "char_012": {
        "name": "Nina",
        "description": "Professional Black woman with natural hair pulled back, navy blazer over white blouse, elevator setting, composed expression",
        "tags": ["woman", "black", "professional", "elevator"]
    },
    "char_013": {
        "name": "Victoria",
        "description": "Dark-haired woman with hair in bun, navy blazer and white blouse, stepping through doorway with greenery behind, outdoor terrace",
        "tags": ["woman", "professional", "doorway"]
    },
    "char_014": {
        "name": "Sophie",
        "description": "Young woman with wavy brown hair, cream cable-knit sweater, holding coffee cup in cafe with brick walls and warm lighting",
        "tags": ["woman", "brunette", "cafe", "cozy"]
    },
    "char_015": {
        "name": "Gerald",
        "description": "Middle-aged man with grey hair, beard, rectangular glasses, light blue dress shirt and patterned tie, office cubicle setting",
        "tags": ["man", "office", "glasses", "middle_aged"]
    },
    "char_016": {
        "name": "Mr. Henderson",
        "description": "Older man with grey hair and full beard, dark suit with striped tie, stern expression, corporate office environment",
        "tags": ["man", "executive", "older", "serious"]
    },
    "char_017": {
        "name": "Poor Milton",
        "description": "Middle-aged man with grey hair, white dress shirt with loose tie, slumped back in office chair with shocked expression, comedic pose",
        "tags": ["man", "office", "shocked", "comedic"]
    },
    "char_018": {
        "name": "Milton",
        "description": "Middle-aged man with grey hair and beard, blue dress shirt, looking down at red stapler on desk, office cubicle - Office Space vibes",
        "tags": ["man", "office", "stapler", "cubicle"]
    },
    "char_019": {
        "name": "Waiting Girl",
        "description": "Young woman with long straight hair, white t-shirt and dark jeans, standing at bus stop in bright daylight, urban setting",
        "tags": ["woman", "casual", "bus_stop", "daytime"]
    },
    "char_020": {
        "name": "Rainy",
        "description": "Woman in dark coat with long hair, standing at bus stop at night in heavy rain, neon lights reflecting on wet pavement, noir atmosphere",
        "tags": ["woman", "rain", "night", "noir"]
    },
    "char_021": {
        "name": "Hiro",
        "description": "Athletic Black man running through Japanese street with cherry blossoms, colorful jacket, carrying basketball, anime-inspired style",
        "tags": ["man", "black", "athletic", "japan", "basketball"]
    },
    "char_022": {
        "name": "Claire",
        "description": "Woman with dark bob haircut, white v-neck blouse, dark jeans and black heels, standing in living room with stone fireplace, surprised expression",
        "tags": ["woman", "bob_haircut", "casual_elegant", "living_room"]
    },
    "char_023": {
        "name": "Claire (Alt)",
        "description": "Same woman with dark bob - standing pose by stone fireplace, composed expression, same outfit",
        "tags": ["woman", "bob_haircut", "fireplace"]
    },
    "char_024": {
        "name": "Claire (Library)",
        "description": "Same dark-haired woman with bob, white top and jeans, now standing in front of built-in bookshelves",
        "tags": ["woman", "bob_haircut", "library", "bookshelves"]
    },
    "char_025": {
        "name": "Frank",
        "description": "Bearded man with grey-brown hair, brown jacket over plaid flannel shirt, rustic setting, warm paternal presence",
        "tags": ["man", "bearded", "rustic", "father_figure"]
    },
    "char_026": {
        "name": "Lily",
        "description": "Young Asian woman with long black hair, bright blue jacket, cheerful smile, busy city street background",
        "tags": ["woman", "asian", "young", "cheerful", "city"]
    },
    "char_027": {
        "name": "Frank & Rosa",
        "description": "Couple looking at old photos together - bearded man and woman with dark curly hair in red scarf, laughing warmly",
        "tags": ["couple", "photos", "nostalgic", "warm"]
    },
    "char_028": {
        "name": "Rosa",
        "description": "Woman with dark curly hair pulled up, red scarf, looking through photo albums with Frank, warm indoor lighting",
        "tags": ["woman", "curly_hair", "red_scarf", "nostalgic"]
    },
    "char_029": {
        "name": "Rosa (Photos)",
        "description": "Same woman with red scarf, examining old photographs, contemplative expression",
        "tags": ["woman", "red_scarf", "photos"]
    },
    "char_030": {
        "name": "Haunted Hannah",
        "description": "Woman with shoulder-length brown hair, dark sweater, pushing open old doors in dusty house, fearful/tense expression, horror atmosphere",
        "tags": ["woman", "horror", "haunted", "scared"]
    },
    "char_031": {
        "name": "Kate",
        "description": "Woman with short dark hair, grey t-shirt, arms crossed, silhouetted in doorway with bright backlight, guarded posture",
        "tags": ["woman", "short_hair", "silhouette", "defensive"]
    },
    "char_032": {
        "name": "Marcus & Jess",
        "description": "Couple in hallway - man with dreadlocks and woman with blonde hair in denim jacket, casual intimate moment",
        "tags": ["couple", "hallway", "casual"]
    },
    "char_033": {
        "name": "Detective Shaw",
        "description": "Woman with short auburn hair, dark jacket, arms crossed, standing in hallway with dramatic backlight, authoritative presence",
        "tags": ["woman", "detective", "serious", "backlit"]
    },
    "char_034": {
        "name": "James",
        "description": "Young man with wavy brown hair, grey crewneck sweater, sitting at outdoor cafe table with coffee, autumn leaves on ground",
        "tags": ["man", "young", "cafe", "autumn"]
    },
    "char_035": {
        "name": "The Inspector",
        "description": "Man in tan trench coat, illuminated by single hanging bulb, dramatic noir lighting, detective/spy aesthetic",
        "tags": ["man", "noir", "detective", "trench_coat"]
    },
    "char_036": {
        "name": "Shadowy Sylvia",
        "description": "Extreme close-up of woman's face, dramatic overhead lighting, dark setting, intense gaze, thriller atmosphere",
        "tags": ["woman", "close_up", "dramatic", "thriller"]
    },
    "char_037": {
        "name": "Chef Marco",
        "description": "Young male chef with dark hair, white chef's coat and black apron, professional kitchen with copper pans, focused on cooking",
        "tags": ["man", "chef", "kitchen", "professional"]
    },
    "char_038": {
        "name": "Coffee Buddies",
        "description": "Two men at cafe - one in grey t-shirt, one in denim shirt - sharing coffee and laughing together, warm friendship",
        "tags": ["men", "friends", "cafe", "happy"]
    },
    "char_039": {
        "name": "Rainy Day Writer",
        "description": "Woman with brown hair in cream turtleneck, sitting in cafe with laptop and coffee, viewed through rain-streaked window",
        "tags": ["woman", "cafe", "laptop", "rain", "writer"]
    },
    "char_040": {
        "name": "The Couple",
        "description": "Asian woman and tall man with brown hair in grey sweater, modern kitchen setting, appears to be same woman as Mei",
        "tags": ["couple", "kitchen", "modern"]
    },
    "char_041": {
        "name": "Mama June",
        "description": "Older Black woman with grey hair pulled back, denim shirt under brown leather vest, standing on road through golden wheat fields at sunset",
        "tags": ["woman", "black", "older", "wise", "rural"]
    },
    "char_042": {
        "name": "Sunset Wanderer",
        "description": "Man with long wavy dark hair and salt-pepper beard, olive green jacket over grey henley, standing in golden fields at sunset, content smile",
        "tags": ["man", "long_hair", "beard", "sunset", "fields"]
    },
    "char_043": {
        "name": "Worried Wendy",
        "description": "Woman with dark hair pulled back, dark jacket, concerned/worried expression, suburban street at dusk, anxious demeanor",
        "tags": ["woman", "worried", "suburban", "dusk"]
    },
    "char_044": {
        "name": "Margot",
        "description": "Woman in burgundy dress with tan overcoat, rainy European cobblestone street, cinematic composition, sophisticated traveler",
        "tags": ["woman", "elegant", "rain", "european", "travel"]
    },
    "char_045": {
        "name": "The Tommies",
        "description": "WWI soldiers in sepia-toned image, helmets and uniforms, carrying wounded comrade across muddy battlefield with explosions, historical war scene",
        "tags": ["soldiers", "wwi", "historical", "sepia", "war"]
    }
}

def main():
    # Load current characters
    with open(CHARS_JSON) as f:
        data = json.load(f)

    updated = 0
    for char_id, metadata in CHARACTER_METADATA.items():
        if char_id in data["characters"]:
            data["characters"][char_id]["name"] = metadata["name"]
            data["characters"][char_id]["description"] = metadata["description"]
            data["characters"][char_id]["tags"] = metadata["tags"]
            updated += 1

    # Save updated file
    with open(CHARS_JSON, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Updated {updated} characters with names and descriptions")
    print(f"Saved to {CHARS_JSON}")

if __name__ == "__main__":
    main()
