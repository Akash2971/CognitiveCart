Flow:

We can keep the already existing recipe -> ingredient flow.

We add a start trip button. This creates a new session. On clicking, I see a PTT button and 3 other buttons - 1. Location, 2. Start Assistance, 3. Barcode Scan.

The feature is only limited to a few product categories (max 4 - yet to decide from target store). These products’ accurate nutritional details will be stored in a product catalog DB.

User will first set a shopping / diet preference in a different screen. This should have very limited questions but should also cover important aspects. This preference context is available to the LLM. This will be used for comparison / recommendation of products.

When user starts a trip, they can interact with the AI using PTT. Every PTT also sends the camera frame(s) from the meta glasses to the AI for context. The AI should help answer user questions in the store and speak it back to the user via the glasses (so it should be concise). The AI can only help the user with general grocery shopping related questions and it knows the existence of the 3 buttons. Everything else is out of scope. Based on the user’s question, if it is in scope, then it should assist the user accordingly with the buttons and its general knowledge.

1.Location - This button opens up a screen and shows the category and its aisle number in the store.
2. Start Assistance - This should scan a shelf and if the shelf’s category is one of the limited categories mentioned above, then will give a personalized recommendation based on user’s preference and the product catalog DB. If it's not one of the categories, then just give a generic recommendation based on LLM’s training knowledge on which one to choose. Here, a shelf may contain many items, and the VLM might not correctly recognize the product labels. So we need to have proper handling or fallback mechanisms.
3. Barcode Scan - This will scan the barcode of the products individually via the phone camera and the scanned list goes to a different screen. After scanning, the AI will get a JSON response of the product which will be used for breaking down / comparison. The AI will highlight a good / bad thing about the product based on user’s preference and suggests whether to take it or not. If user scans multiple items, then it chooses the best out them and suggests to take it or not.

Other grocery related qns can be answered from from its general knowledge. Anything else is out of scope and should say - sorry i cannot help with that and tell the user what it can help with.

When the user ends the trip, we show them the summary of 1. cognitive loads they’ve faced. If user searches, then search load is added. Start assistance will trigger a choice overload. Barcode scan will trigger a comparison / comprehension load. 2. How many items they’ve scanned. 3. Time they’ve taken for the trip. 4. Anything else relevant.
