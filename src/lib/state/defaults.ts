import type { AppState, Member } from "../types";

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newMember(over: Partial<Member> = {}): Member {
  return {
    id: newId(),
    name: "",
    age: "adult",
    allergies: [],
    diet: "",
    rules: [],
    spice: "medium",
    stage: "",
    dislikes: "",
    cooks: true,
    ...over,
  };
}

export function defaultState(): AppState {
  return {
    version: 1,
    onboarded: false,
    members: [newMember()],
    cuisines: [],
    planType: "5day",
    plan: null,
    instant: { meal: "d", maxMin: 45, pickId: null },
    pantry: [],
    inCart: {},
    stores: [{ id: "main", name: "My usual grocery store" }],
    aisleStore: {},
    settings: { nutrition: "badges", leftovers: true, rotation: true, takeoutPerPerson: 19 },
    customRecipes: [],
    customIngredients: {},
  };
}
