import dotenv from "dotenv";

dotenv.config({
    path: ".env.local",
});

import { generateEmbedding } from "@/lib/ai/embeddings/gateway";

async function main() {
    const embedding = await generateEmbedding(
        "User is learning Kubernetes to build a career in Cloud and DevOps.",
    );

    console.log("Embedding dimensions:", embedding.length);
    console.log("First 5 values:", embedding.slice(0, 5));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});