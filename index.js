var spellchecker = require("spellchecker");

exports = module.exports = new Grammarify();

function Grammarify(){

    // Private variables
    var preProcessMap = new Grammarify_PreProcess();
    var smsMap = new Grammarify_SMS();
    var disconnectedMap = new Grammarify_Disconnected();
    var numberMap = new Grammarify_Numbers();

    return {
        clean: function(string,validationRules){
            if (string.length === 0){
                return "";
            }


            // Replace unicode characters that break parsing
            string = string
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"');

            // Run through pre-processing;
            // fixing periods and other characters
            string = preProcessMap.fixPeriodAndEllipsis(string);
            string = preProcessMap.fixSpaceAfterCharacter(string);

            // Get rid of all whitespace
            var words = string.split(" ");
            var newWords = words.filter(w => w.length !== 0);

            // Fix stretched words
            newWords = smsMap.fixStretching(newWords);

            // Replace shorthand/improper grammar
            // the spellchecker might miss
            console.log("validationRules.shorthandToFullWords.value =",validationRules.shorthandToFullWords.value)
            console.log("validationRules.shorthandToFullWords.shorthandList =",validationRules.shorthandToFullWords.shorthandList)
            if (validationRules.shorthandToFullWords.value === true ) {
                newWords = smsMap.fixShorthand(newWords, validationRules.shorthandToFullWords.shorthandList );
            }
            // Fix words that should really be
            // one word instead of two
            newWords = disconnectedMap.fixSeparated(newWords);

            // Save where there is existing punctuation
            var endingPunctuation = [];
            for (var i = 0; i < newWords.length; i++){
                if (newWords[i].indexOf(".") >= 0){
                    endingPunctuation.push(".");
                } else if (newWords[i].indexOf("!") >= 0){
                    endingPunctuation.push("!");
                } else if (newWords[i].indexOf("?") >= 0){
                    endingPunctuation.push("?");                    
                } else {
                    endingPunctuation.push("");
                }
            }
            
            
            // Clean the sentence;
            // main logic loop
            var duplicates = ["the", "a", "an", "and", "but", "or", "nor", "for", "so", "yet"];
            var corrections = [];
            var endingPunctuationIndex = false;
            var lastCharacter = "";
            var spcheckThisWord = "";
            var preSpellcheck = "";
            var preSpellcheckEndingPunct = "";
            for (var i = 0; i < newWords.length; i++){

                // Remove words that are safe to delete if duplicated after each other
                if (i > 0 && 
                    newWords[i] === newWords[i-1].trim().toLowerCase() &&
                    duplicates.indexOf(newWords[i].toLowerCase()) >= 0){

                    newWords.splice(i, 1);
                    i--;
                    continue;
                }

                // Spellcheck words;
                // remove ending punctuation first
                preSpellcheck = newWords[i].match(/[\W]+$/g);

                if (preSpellcheck !== null){
                    spcheckThisWord = newWords[i].replace(/[\W]+$/g, "");
                } else {
                    spcheckThisWord = newWords[i];
                }
                if (spellchecker.isMisspelled(spcheckThisWord)){
                    corrections = spellchecker.getCorrectionsForMisspelling(spcheckThisWord);
                    
                    if (corrections.length > 0){
                        newWords[i] = corrections[0];
                        corrections = [];

                        // Add ending punctuation back in
                        if (preSpellcheck !== null){
                            newWords[i] = newWords[i] + preSpellcheck[0];
                        }
                    }
                }

                // Capitalize words if necessary
                if (i > 0){
                    endingPunctuationIndex = endingPunctuation[i-1] !== "";
                }                
                if (i === 0 || endingPunctuationIndex){
                    newWords[i] = newWords[i][0].toUpperCase() + newWords[i].substr(1);
                }

                // Add leading space to word
                if (i !== 0){
                    newWords[i] = " " + newWords[i];
                }
            }

            // Add ending period if necessary
            var lastWord = newWords.length - 1;

            // Only if the word doesn't already end in punctuation
            lastCharacter = newWords[lastWord][newWords[lastWord].length-1];
            if (lastCharacter !== "." &&
                lastCharacter !== "!" &&
                lastCharacter !== "?"){
                    newWords[lastWord] = newWords[lastWord] + ".";
                }

            return newWords.join("");
        }
    }    
}

function Grammarify_PreProcess(){

    // Valid characters to fix;
    // cannot be duplicated
    var validCharsToFix = [",", ";", ":", "%"];

    var fixer = function(input, charToFix){
        
        // Remove this character from the beginning of the string
        var regex = new RegExp("^[ \\" + charToFix + ".]+", "g");
        input = input.replace(regex, "");

        // Capture all instances of this character
        regex = new RegExp("\\b([ \\" + charToFix + "]*\\" + charToFix + "[ \\" + charToFix + "]*)(\\b|$)", "g");
        var badMatches = input.match(regex);
        var badMatchesIndex = 0;
        var tempSearch = "";

        if (badMatches !== null){
            for (var i = 0; i < badMatches.length; i++){
                badMatchesIndex = input.indexOf(badMatches[i], badMatchesIndex);

                tempSearch = input.substr(badMatchesIndex);

                // Corner-case;
                // don't add space if fixing this
                // 3,,000
                if (badMatchesIndex + badMatches[i].length < input.length &&
                    input[badMatchesIndex + badMatches[i].length + 1].match(/\d/) !== null){
                    tempSearch = tempSearch.replace(badMatches[i], charToFix);
                } else {
                    tempSearch = tempSearch.replace(badMatches[i], (charToFix + " "));
                }
                
                input = input.substr(0, badMatchesIndex) + tempSearch;

                badMatchesIndex++;
            }
        }

        return input;
    };

    return {
        fixPeriodAndEllipsis: function(input){

            // Remove periods from the beginning of the string
            input = input.replace(/^[ \.]+/g, "");
            
            var badPeriods = input.match(/\b([ \.]*\.[ \.]*)(\b|$)/g);
            var badPeriodsIndex = 0;
            var tempSearch = "";
            
            if (badPeriods !== null){
                for (var i = 0; i < badPeriods.length; i++){
                    badPeriodsIndex = input.indexOf(badPeriods[i], badPeriodsIndex);
                    
                    // If we only find a single period;
                    // ie. "the pig.ran"
                    //     "the pig .ran"
                    //     "the pig . ran"
                    if (badPeriods[i].split(".").length == 2){
                        tempSearch = input.substr(badPeriodsIndex);
                        tempSearch = tempSearch.replace(badPeriods[i], ". ");
                        input = input.substr(0, badPeriodsIndex) + tempSearch;

                        badPeriodsIndex++;
                    } else if (badPeriods[i].split(".").length >= 3){
                        
                        // If we find an ellipsis-like pattern;
                        // ie. "the pig..ran"
                        //     "the pig ..ran"
                        //     "the pig .. ran"
                        tempSearch = input.substr(badPeriodsIndex);
                        tempSearch = tempSearch.replace(badPeriods[i], "... ");
                        input = input.substr(0, badPeriodsIndex) + tempSearch;

                        badPeriodsIndex++;
                    }
                }
            }
            
            return input;
        },
        fixSpaceAfterCharacter: function(input){

            // Process all characters we can fix
            for (var i = 0; i < validCharsToFix.length; i++){
                input = fixer(input, validCharsToFix[i]);
            }

            return input;
        }
    }
}

function Grammarify_SMS(){

    var map = {
        // #s
        "2night": "tonight",
        "2nite": "tonight",

        // A
        "asap": "as soon as possible",
        "asl": "American Sign Language",

        // B
        "bc": "because",
        "bf": "boyfriend",
        "btw": "by the way",

        // C
        "cuz": "because",

        // D

        // E
        "eg": "example",
        "els": "else",

        // F
        "f": "female",
        "ftw": "for the win",
        "fyi": "for your information",

        // G
        "gf": "girlfriend",
        "gotta": "got to",
        "gr8": "great",

        // H
        "hada": "had a",
        "hmu": "hit me up",
        "hr": "hour",
        "hrs": "hours",

        // I
        "idk": "I don't know",
        "im": "I'm",

        // J
        "jude": "Jude", // how to expand this to all proper nouns??

        // K
        "kinda": "kind of",

        // L

        // M
        "m": "male",
        "msg": "message",

        // N
        "nite": "night",

        // O
        "omg": "oh my gosh",

        // P
        "pls": "please",
        "plz": "please",
        "ppl": "people",           

        // Q

        // R

        // S

        // T
        "tbh": "to be honest",
        "tho": "though",
        "thru": "through",
        "tryna": "trying to",

        // U
        "u": "you",

        // V

        // W
        "w": "with",
        "wanna": "want to",
        "whaat": "what", // spellchecker library thinks this is a word
        "whaaat": "what", // spellchecker library thinks this is a word
        "wk": "week",
        "wks": "weeks",
        "wtf": "what the fuck",
        "wth": "what the heck",
        "wya": "where are you at",

        // X

        // Y
        "yknow": "you know"

        // Z
        
    };

    var unstretchify = function(word, indicees, pivot){

        // Base cases;
        // word matches to a shorthand map we have defined
        if (typeof map[word] !== "undefined"){
            return map[word];
        } else if (!spellchecker.isMisspelled(word)){
            
            // The word is not misspelled
            return word;
        } else if (indicees.reduce((acc, cur) => {return acc + (cur.endIndex - cur.startIndex);}, 0) === 0){
            
            // Above check could use optimization;
            // exit if we've iterated fully over
            // this particular pivot value
            return "";
        } else {

            // Alter indicees array
            var indiceesArrayIndex = pivot > 0 ? pivot - 1 : indicees.length-1;

            if (indicees[indiceesArrayIndex].endIndex > indicees[indiceesArrayIndex].startIndex){
                indicees[indiceesArrayIndex].endIndex = indicees[indiceesArrayIndex].endIndex - 1;

                // Chop off duplicate letter in word,
                // this is how we work to the base case
                word = word.substr(0, indicees[indiceesArrayIndex].startIndex) + word.substr(indicees[indiceesArrayIndex].startIndex+1);
            } else {

                // Change the pivot
                if (pivot > 0){
                    pivot = pivot - 1;
                } else {
                    pivot = indicees.length - 1;
                }
            }

            return unstretchify(word, indicees, pivot);
        }
    };

    return {
        fixStretching: function(input){
            var container = [];

            // Create the data we are transforming
            if (Array.isArray(input)){
                container = input;
            } else if (typeof input === "string"){
                container = input.split(" ");
            } else {
                return "";
            }

            // Fix the input
            var stretchedIndicees = [];
            var lastMarkedChar = "";
            var tempWord = "";
            for (var i = 0; i < container.length; i++){

                // Identify stretched characters within the word
                for (var j = 0; j < container[i].length; j++){

                    if (j > 0){

                        // Save information about stretched letters
                        // ie. "preettyyyy"
                        if (container[i][j] === container[i][j-1]){

                            if (lastMarkedChar === ""){
                                stretchedIndicees.push({
                                    "startIndex": j-1,
                                    "endIndex": j 
                                });
                                lastMarkedChar = container[i][j];
                            } else {
                                stretchedIndicees[stretchedIndicees.length-1]["endIndex"] = j; 
                            }                                                                      
                        } else {
                            lastMarkedChar = "";
                        }
                    }
                }


                // Only fix word if it isn't shorthand and
                // it is incorrect
                if (stretchedIndicees.length > 0 &&
                    typeof container[i] !== "undefined" &&
                    spellchecker.isMisspelled(container[i])){

                    var fixed = "";
                    var staticIndicees = JSON.parse(JSON.stringify(stretchedIndicees)); // Deep copy array
 
                    for (var pivot = 0; pivot < staticIndicees.length; pivot++){
                        fixed = unstretchify(container[i], staticIndicees, pivot);

                        if (fixed !== ""){
                            container[i] = fixed;
                            break;
                        }

                        // Reset w/ deep copy
                        staticIndicees = JSON.parse(JSON.stringify(stretchedIndicees));
                    }
                }

                stretchedIndicees = [];
                lastMarkedChar = "";
            }

            return container;
        },
        fixShorthand: function(input, shorthandList){
            var punctuation = "";
            var container = [];
            var stripped = "";

            // Create the data we are transforming
            if (Array.isArray(input)){
                container = input;
            } else if (typeof input === "string"){
                container = input.split(" ");
            } else {
                return "";
            }

            // Fix the input
            for (var i = 0; i < container.length; i++){

                // Save existing punctuation
                stripped = container[i].match(/([a-zA-Z0-9']*)([\?!\.;+]*)$/);
                if (typeof stripped[2] !== ""){
                    punctuation = stripped[2];
                }
                map = shorthandList;
                stripped = stripped[1]; // Sets stripped to input that was passed into the .match call
                if (typeof map[stripped] !== "undefined"){
                    container[i] = map[stripped];

                    // Re-add punctuation back in
                    if (punctuation !== ""){
                        container[i] = container[i] + punctuation;
                        punctuation = "";
                    }
                }
            }

            return container;
        }
    }
}

function Grammarify_Disconnected(){
    
    var list = [
        // A
        "awesome",

        // B

        // C

        // D

        // E
        "everything",

        // F

        // G

        // H
        "herself",
        "himself",

        // I

        // J

        // K

        // L

        // M

        // N
        "nowhere",

        // O

        // P

        // Q

        // R

        // S

        // T
        "today",

        // U

        // V

        // W

        // X

        // Y
        "yourself"

        // Z
    ];
    
    return {
        fixSeparated: function(input){
            var punctuation = "";
            var container = [];
            var stripped = "";

            // Create the data we are transforming
            if (Array.isArray(input)){
                container = input;
            } else if (typeof input === "string"){
                container = input.split(" ");
            } else {
                return "";
            }

            // Fix the input
            var listIndex = 0;
            if (container.length > 1){
                for (var i = 1; i < container.length; i++){

                    // If we found a match
                    listIndex = list.indexOf((container[i-1] + container[i]).toLowerCase());
                    if (listIndex >= 0){
                        container[i-1] = list[listIndex];

                        container.splice(i, 1);
                        i--;
                    }
                }
            }

            return container;
        }
    }
}

function Grammarify_Numbers(){

}