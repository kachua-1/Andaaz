// A sample family recipe so the app can be explored without recording anything
// (and without spending Sarvam credits). It has a transcript but no audio.

import type { Recipe } from "./types";

export function sampleRecipe(id: string): Recipe {
  return {
    id,
    createdAt: Date.now(),
    source: "sample",
    title: "Besan Laddoo",
    titleOriginal: "बेसन के लड्डू",
    summary: "Slow-roasted gram flour laddoos, the way Dadi made them every Diwali.",
    language: "hi-IN",
    elderName: "Dadi",
    taughtBy: "Her mother-in-law, in Meerut",
    festival: "Diwali",
    story:
      "Dadi learned these laddoos from her saas in Meerut, the first Diwali after her wedding. Her saas never let her rush the besan; she said the besan itself tells you when it is ready. Every Diwali since, the whole house has smelled of roasting besan for an afternoon.",
    storyQuote: "सास जी कहती थीं, बेसन को जल्दी मत करो, वो खुद बताएगा।",
    storySegments: [0, 1],
    servings: "About 14 laddoos",
    ingredients: [
      { name: "Gram flour (besan)", original: "बेसन", quantityOriginal: "दो कटोरी", min: 130, max: 140, unit: "g", isEstimate: true, substitutes: ["Fine besan from any grocery store"], note: "2 of Dadi's katoris" },
      { name: "Ghee", original: "घी", quantityOriginal: "एक कटोरी से थोड़ा कम", min: 110, max: 125, unit: "g", isEstimate: true, substitutes: ["Unsalted butter, clarified"] },
      { name: "Powdered raw sugar (boora)", original: "बूरा", quantityOriginal: "डेढ़ कटोरी", min: 185, max: 195, unit: "g", isEstimate: true, substitutes: ["Powdered sugar", "Tagar / boora from an Indian store"] },
      { name: "Green cardamom", original: "इलायची", quantityOriginal: "चार-पाँच", min: 4, max: 5, unit: "pods", isEstimate: true, substitutes: ["1/4 tsp cardamom powder"] },
      { name: "Almonds", original: "बादाम", quantityOriginal: "मुट्ठी भर", min: 25, max: 35, unit: "g", isEstimate: true, substitutes: ["Cashews", "Pistachios"] },
    ],
    steps: [
      { instruction: "Warm the ghee in a heavy kadhai on the lowest flame.", originalQuote: "मोटी कढ़ाई में घी डालो, आँच बिल्कुल धीमी।", sensoryCue: "The ghee melts and turns clear.", cueSense: "sight", timerSeconds: null, segments: [3], clipStart: null, clipEnd: null },
      { instruction: "Add the besan and stir without stopping.", originalQuote: "बेसन डालो और चलाते रहो, रुकना नहीं।", sensoryCue: "The raw smell goes and it smells nutty, like roasted peanuts.", cueSense: "smell", timerSeconds: 1200, segments: [5, 6], clipStart: null, clipEnd: null },
      { instruction: "Keep roasting until it turns golden and the ghee separates.", originalQuote: "जब तक रंग सुनहरा न हो जाए और घी किनारे छोड़ने लगे।", sensoryCue: "Ghee separates at the edges and the mixture loosens and turns golden.", cueSense: "sight", timerSeconds: null, segments: [7], clipStart: null, clipEnd: null },
      { instruction: "Take it off the heat and let it cool until just warm.", originalQuote: "उतार के ठंडा होने दो, इतना कि हाथ लगा सको।", sensoryCue: "Warm, but you can comfortably hold it in your palm.", cueSense: "touch", timerSeconds: 600, segments: [9], clipStart: null, clipEnd: null },
      { instruction: "Mix in the boora, crushed cardamom and chopped almonds.", originalQuote: "अब बूरा, इलायची और बादाम मिलाओ।", sensoryCue: "", cueSense: "sight", timerSeconds: null, segments: [11], clipStart: null, clipEnd: null },
      { instruction: "Grease your palms with ghee and press the mixture into round laddoos.", originalQuote: "मुट्ठी में दबा के गोल करो, हथेली पे घी लगा लो।", sensoryCue: "The mixture holds its shape when pressed.", cueSense: "touch", timerSeconds: null, segments: [13], clipStart: null, clipEnd: null },
    ],
    tips: ["Never rush the besan: low flame the whole time.", "If the mixture won't bind, warm it slightly and add a spoon of ghee."],
    missing: ["Should the cardamom be ground with the sugar or crushed separately?", "How do you know the mixture has cooled enough to add the boora?"],
    segments: [
      { speaker: "0", text: "दिवाली पे हमेशा बेसन के लड्डू बनते थे, सास जी सिखाई थीं मेरठ में।", start: 0, end: 5.2 },
      { speaker: "0", text: "सास जी कहती थीं, बेसन को जल्दी मत करो, वो खुद बताएगा।", start: 5.2, end: 9.8 },
      { speaker: "1", text: "दादी, शुरू कैसे करते हैं?", start: 10.1, end: 11.9 },
      { speaker: "0", text: "मोटी कढ़ाई में घी डालो, आँच बिल्कुल धीमी।", start: 12.2, end: 16.0 },
      { speaker: "1", text: "कितना बेसन?", start: 16.3, end: 17.4 },
      { speaker: "0", text: "दो कटोरी बेसन डालो और चलाते रहो, रुकना नहीं।", start: 17.6, end: 21.9 },
      { speaker: "0", text: "बीस-पच्चीस मिनट लगते हैं, जब तक कच्ची खुशबू न चली जाए, मूंगफली जैसी खुशबू आने लगे।", start: 21.9, end: 28.4 },
      { speaker: "0", text: "जब तक रंग सुनहरा न हो जाए और घी किनारे छोड़ने लगे।", start: 28.4, end: 32.6 },
      { speaker: "1", text: "फिर?", start: 32.9, end: 33.4 },
      { speaker: "0", text: "उतार के ठंडा होने दो, इतना कि हाथ लगा सको, दस मिनट।", start: 33.6, end: 38.1 },
      { speaker: "1", text: "चीनी कितनी?", start: 38.4, end: 39.5 },
      { speaker: "0", text: "डेढ़ कटोरी बूरा, चार-पाँच इलायची, मुट्ठी भर बादाम। अब बूरा, इलायची और बादाम मिलाओ।", start: 39.7, end: 46.0 },
      { speaker: "1", text: "और लड्डू कैसे बाँधते हैं?", start: 46.2, end: 48.0 },
      { speaker: "0", text: "मुट्ठी में दबा के गोल करो, हथेली पे घी लगा लो।", start: 48.2, end: 52.0 },
    ],
    elderSpeaker: "0",
    mediaId: null,
    mediaType: null,
    diaryImageId: null,
    diaryText: null,
    translations: {},
  };
}
