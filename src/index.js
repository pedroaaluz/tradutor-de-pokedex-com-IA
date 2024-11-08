"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var url_1 = require("url");
var path_1 = require("path");
var chalk_1 = require("chalk");
var node_llama_cpp_1 = require("node-llama-cpp");
var __dirname = path_1.default.dirname((0, url_1.fileURLToPath)(import.meta.url));
var modelsDirectory = path_1.default.join(__dirname, "..", "models");
var llama = await (0, node_llama_cpp_1.getLlama)();
console.log(chalk_1.default.yellow("Resolving model file..."));
var modelPath = await (0, node_llama_cpp_1.resolveModelFile)("hf:mradermacher/Meta-Llama-3.1-8B-Instruct-GGUF/Meta-Llama-3.1-8B-Instruct.Q8_0.gguf", modelsDirectory);
console.log(chalk_1.default.yellow("Loading model..."));
var model = await llama.loadModel({ modelPath: modelPath });
console.log(chalk_1.default.yellow("Creating context..."));
var context = await model.createContext();
var session = new node_llama_cpp_1.LlamaChatSession({
    contextSequence: context.getSequence()
});
console.log();
var q1 = "Hi there, how are you?";
console.log(chalk_1.default.yellow("User: ") + q1);
process.stdout.write(chalk_1.default.yellow("AI: "));
var a1 = await session.prompt(q1, {
    onTextChunk: function (chunk) {
        // stream the response to the console as it's being generated
        process.stdout.write(chunk);
    }
});
process.stdout.write("\n");
console.log(chalk_1.default.yellow("Consolidated AI answer: ") + a1);
console.log();
var q2 = "Summarize what you said";
console.log(chalk_1.default.yellow("User: ") + q2);
var a2 = await session.prompt(q2);
console.log(chalk_1.default.yellow("AI: ") + a2);
console.log();
var q3 = "What are the verbs in this sentence: 'The cat sat on the mat'";
console.log(chalk_1.default.yellow("User: ") + q3);
// force the model to respond in accordance to the specified JSON schema format,
// so we can parse it and use it programmatically
var responseGrammar = await llama.createGrammarForJsonSchema({
    type: "object",
    properties: {
        verbs: {
            type: "array",
            items: {
                type: "string"
            }
        }
    }
});
var a3 = await session.prompt(q3, { grammar: responseGrammar });
var parsedResponse = responseGrammar.parse(a3);
console.log(chalk_1.default.yellow("AI:"), parsedResponse.verbs);
console.log();
if (parsedResponse.verbs.length > 0) {
    var q4 = "Define the verb \"".concat(parsedResponse.verbs[0], "\"");
    console.log(chalk_1.default.yellow("User: ") + q4);
    var a4 = await session.prompt(q4);
    console.log(chalk_1.default.yellow("AI: ") + a4);
    console.log();
}
else {
    var q4 = "Are you sure there are no verbs in the sentence?";
    console.log(chalk_1.default.yellow("User: ") + q4);
    var a4 = await session.prompt(q4);
    console.log(chalk_1.default.yellow("AI: ") + a4);
    console.log();
}
