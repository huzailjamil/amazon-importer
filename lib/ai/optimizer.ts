import OpenAI from "openai";
import { z } from "zod";

export const OptimizedSchema = z.object({
  title: z.string().min(3),
  descriptionHtml: z.string().min(20),
  seoTitle: z.string().min(3),
  metaDescription: z.string().min(20),
  tags: z.array(z.string()).max(20),
  primaryKeyword: z.string().min(2),
  secondaryKeywords: z.array(z.string()).max(15),
  imageAltText: z.array(z.string()).max(12),
  seoScore: z.number().min(0).max(100)
});

export async function optimizeProduct(input: unknown) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server");
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    input: [
      {
        role: "system",
        content: "You are an ecommerce SEO product copywriter. Use only supplied product facts. Do not invent certifications, materials, dimensions, compatibility, origin, warranty, or performance claims. Rewrite naturally and substantially; do not keyword-stuff. ALT text must describe likely image content without pretending to see details not supplied. Return JSON only."
      },
      {
        role: "user",
        content: `Create original on-page ecommerce content from these product facts. Produce title, useful HTML description, SEO title, meta description, primary keyword, secondary keywords, store tags, image ALT suggestions and a conservative SEO score. Product facts: ${JSON.stringify(input)}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "optimized_product",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            descriptionHtml: { type: "string" },
            seoTitle: { type: "string" },
            metaDescription: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            primaryKeyword: { type: "string" },
            secondaryKeywords: { type: "array", items: { type: "string" } },
            imageAltText: { type: "array", items: { type: "string" } },
            seoScore: { type: "number" }
          },
          required: ["title", "descriptionHtml", "seoTitle", "metaDescription", "tags", "primaryKeyword", "secondaryKeywords", "imageAltText", "seoScore"]
        }
      }
    }
  });
  return OptimizedSchema.parse(JSON.parse(response.output_text));
}
