import "./globals.css";
import "./product-images.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Importer",
  description: "Secure AI ecommerce product import and Shopify draft publishing"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
