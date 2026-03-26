import { redirect } from "next/navigation";

export default function CockpitIndex() {
  redirect("/cockpit/overview");
}
