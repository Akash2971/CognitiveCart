
we have a vlm. 

vlm input : 
{
user_message: "", // in active only.
context: {
    user_summary : "" //always passed except the first time
    frame : "" // current image frame always passed.
    load_type: ""  //always passed except the first time
    confidence: ""   // always passed except the first time
    additional_context: "" //decide later (like store map, scan results etc)
}
}

in passive, only frame will be passed -> to output below fields.
in active, frame + user_message -> to output below fields.
additional_context can come from performing an action like barcode scan, navigate etc. (we'll do this later)

vlm output :

{
    response: "" // the response user needs to hear
    suggested_action: "" // only populated if updated_confidence > 0.7
    updated_summary: "" //the updated summary after the recent frame
    updated_load_type: ""
    updated_confidence: "" //the updated confidence score based on frame OR user_message.
}

response field will be populated if the agent decides to intervene (confidence >0.5) OR if user_message field is present (as a response to user input PTT) OR if additional context (future scope) is given from an action output (like scan or navigate).

future scope :
if a suggested action is populated, then we need to get user's confimation and do it automatically.
two actions for now : 1. navigate, 2. scan.

1. navigate adds store map in additional context and gets the answer to user's question.
2. scan opens barcode scanner and lets user scan many items and uses those scan results in the
additional context to provide answer to user's query.


load types :
1. search / navigation
2. comparision
3. choice overload.
4. comprehension.

examples :
1. user asks "i need to compare these" -> system detects comparision load. if confidence > 0.7, 
suggests scan. user scans 1 item. system knows for comparision you need 2(from llm knowledge), asks to scan more, after enough context, it responds to query.

2. user asks "where is butter" -> system detects search load. if confidence > 0.7, suggests to use map, automatically sees current frame and map to guide user.

3. user asks "whats this" -> detect comprehension load. if confidence > 0.7, suggests to use scan, user scans the item, after context, system responds.

4. user asks "which of these better" -> detect choice overload if too many items in frame. narrows down options, asks to scan two or three, then gives best one.



