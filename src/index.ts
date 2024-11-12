import fs from "fs";
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";
import chalk from "chalk";
import path from "path";

// IA CONFIG
const modelsDirectory = path.join(__dirname, "..", "models");
const llama = await getLlama();

console.log(chalk.yellow("Resolving model file..."));
const modelPath = await resolveModelFile(
    "hf_bartowski_gemma-2-2b-it-Q6_K_L.gguf",
    modelsDirectory
);

console.log(chalk.yellow("Loading model..."));
const model = await llama.loadModel({ modelPath });
const context = await model.createContext();

const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
});

const formatData = (data: string[]) => {
    const pokemonList = data.map((pokemon) => {
        const pokemonData = pokemon.trim().split("\n");

        const pokemonObject = pokemonData.reduce(
            (
                acc: Record<
                    string,
                    string | string[] | { level: number; move: string }[]
                >,
                line
            ) => {
                const [key, value] = line.split(" = ");

                if (key?.includes("[")) {
                    const index = key.replace("]", "").replace("[", "").trim();
                    acc.id = index.toString();
                }

                if (key && value) {
                    switch (key) {
                        case "Type1":
                        case "Type2":
                            const typeTranslations: Record<string, string> = {
                                FIRE: "FOGO",
                                WATER: "AGUA",
                                GRASS: "GRAMA",
                                ELECTRIC: "ELÉTRICO",
                                ICE: "GELO",
                                FIGHTING: "LUTADOR",
                                POISON: "VENENOSO",
                                GROUND: "TERRA",
                                FLYING: "VOADOR",
                                PSYCHIC: "PSÍQUICO",
                                BUG: "INSETO",
                                ROCK: "PEDRA",
                                GHOST: "FANTASMA",
                                DRAGON: "DRAGÃO",
                                DARK: "NOTURNO",
                                STEEL: "AÇO",
                                FAIRY: "FADA",
                                NORMAL: "NORMAL",
                            };

                            acc[key.trim()] = typeTranslations[value.trim()]!;
                            break;
                        case "Moves":
                            acc[key.trim()] = value
                                .trim()
                                .split(",")
                                .reduce((moves, item, index, array) => {
                                    if (index % 2 === 0) {
                                        moves.push({
                                            level: parseInt(item, 10),
                                            move: array[index + 1]!,
                                        });
                                    }
                                    return moves;
                                }, [] as { level: number; move: string }[]);
                            break;
                        case "TutorMoves":
                        case "EggMoves":
                            acc[key.trim()] = value.trim().split(",");
                            break;
                        default:
                            acc[key.trim()] = value.trim();
                            break;
                    }
                }
                return acc;
            },
            {}
        );

        return pokemonObject;
    });

    return pokemonList;
};

const convertToOriginalFormat = (
    pokemonList: Record<
        string,
        string | string[] | number | { level: number; move: string }[]
    >[]
) => {
    return pokemonList
        .map((pokemon) => {
            let originalFormat = `[${pokemon.id}]\n`;

            for (const [key, value] of Object.entries(pokemon)) {
                switch (key) {
                    case "id":
                        break;
                    case "Moves":
                        originalFormat += `${key} = ${(
                            value as unknown as {
                                level: number;
                                move: string;
                            }[]
                        )
                            .map(({ level, move }) => `${level}, ${move}`)
                            .join(",")}\n`;
                        break;
                    case "TutorMoves":
                    case "EggMoves":
                        originalFormat += `${key} = ${(
                            value as unknown as string[]
                        ).join(",")}\n`;
                        break;
                    default:
                        originalFormat += `${key} = ${value}\n`;
                        break;
                }
            }

            originalFormat += "#-------------------------------\n";
            return originalFormat;
        })
        .join("");
};

const translate = async (text: string) => {
    const startTime = Date.now();

    const q1 = `Traduza o seguinte texto do inglês para o português e forneça apenas a tradução: ${text}`;

    let translatedText = "";
    await session.prompt(q1, {
        onTextChunk(chunk) {
            translatedText += chunk;
        },
    });

    console.log(chalk.yellow("Descrição traduzida: ") + translatedText);

    const endTime = Date.now();
    const translatedTime = (endTime - startTime) / 1000;

    return { translatedText, translatedTime };
};

const analysisFilePath = "./src/tradução/analise.json";

const calculateP90 = (times: number[]) => {
    times.sort((a, b) => a - b);
    const index = Math.ceil(0.9 * times.length) - 1;
    return times[index];
};

const saveAnalysis = (
    translatedData: {
        Pokedex: string;
        Name: string;
        PokedexTranslated: string;
        translatedTime: string;
    }[] = [],
    range: {
        min: number;
        max: number;
    }
) => {
    const translationTimes = translatedData.map((pokemon) =>
        parseFloat(pokemon.translatedTime as string)
    );
    const totalTranslationTime = translationTimes.reduce(
        (acc, time) => acc + time,
        0
    );
    const averageTranslationTime =
        totalTranslationTime / translationTimes.length;
    const p90TranslationTime = calculateP90(translationTimes);

    const analysisData = {
        date: new Date().toISOString(),
        totalTranslationTime,
        averageTranslationTime,
        p90TranslationTime,
        translatedPokemonCount: translatedData.length,
        translationRange: range,
        translatedPokemon: translatedData,
        maxTranslatedTime: Math.max(...translationTimes),
        minTranslatedTime: Math.min(...translationTimes),
    };

    let existingData = [];
    if (fs.existsSync(analysisFilePath)) {
        const fileContent = fs.readFileSync(analysisFilePath, "utf8");
        existingData = JSON.parse(fileContent);
    }

    existingData.push(analysisData);

    fs.writeFileSync(analysisFilePath, JSON.stringify(existingData, null, 2));
};

const main = async (range: { min: number; max: number }) => {
    const fileContent = fs.readFileSync("./src/pokedex.txt", "utf8");
    const pokemonList = fileContent
        .split("#-------------------------------")
        .slice(range.min - 1, range.max);

    const formattedData = formatData(pokemonList);

    const translatedData: Record<
        string,
        string | string[] | { level: number; move: string }[] | number
    >[] = [];

    const statictics = [];

    let count = range.max - range.min + 1;

    for (const pokemon of formattedData) {
        const { Pokedex, Name, id } = pokemon as {
            Pokedex: string;
            Name: string;
            id: string;
        };

        console.log(`Traduzindo ${Name}`);

        const { translatedText, translatedTime } = await translate(Pokedex);

        console.log(`${Name} traduzido em ${translatedTime} segundos`);

        translatedData.push({
            ...pokemon,
            id: Number(id),
            Pokedex: translatedText,
            PokedexEn: Pokedex,
        });

        statictics.push({
            Pokedex,
            Name,
            PokedexTranslated: translatedText,
            translatedTime: translatedTime.toString(),
        });

        count--;

        console.log(`${count} pokemons restantes`);
    }
    const originalFormat = convertToOriginalFormat(translatedData);

    let existingOriginalFormat = "";
    if (fs.existsSync("./src/tradução/originFormat.txt")) {
        existingOriginalFormat = fs.readFileSync(
            "./src/tradução/originFormat.txt",
            "utf8"
        );
    }

    const combinedOriginalFormat =
        existingOriginalFormat + "\n" + originalFormat;

    fs.writeFileSync("./src/tradução/originFormat.txt", combinedOriginalFormat);

    let existingTranslatedData = [];

    if (fs.existsSync("./src/tradução/formattedData.json")) {
        const fileContent = fs.readFileSync(
            "./src/tradução/formattedData.json",
            "utf8"
        );
        existingTranslatedData = JSON.parse(fileContent);
    }

    existingTranslatedData.push(...translatedData);

    fs.writeFileSync(
        "./src/tradução/formattedData.json",
        JSON.stringify(existingTranslatedData, null, 2)
    );

    saveAnalysis(statictics, range);
};

main({ min: 651, max: 700 });

/**
 *
 *
 *
 */
