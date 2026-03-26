import type { ReactNode } from "react";
import { Bebas_Neue, Inter } from "next/font/google";
import "../globals.css";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "PPP TV Cockpit",
  description: "Autoposter control center",
};

export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${bebas.variable} ${inter.variable} font-sans`}>{children}</div>
  );
}
