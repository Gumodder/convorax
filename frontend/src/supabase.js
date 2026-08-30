import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jdmoprahepzbpmuttywd.supabase.co";
const SUPABASE_KEY = "sb_publishable_Kcf339oAuZsvpsm-ZuGiGg_4QT43uo3";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
