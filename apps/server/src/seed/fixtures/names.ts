/** Twenty customers for the seeded history. */
export const SEED_NAMES = [
  "Ananya Iyer",
  "Vikram Singh",
  "Priya Nair",
  "Arjun Reddy",
  "Sneha Kulkarni",
  "Imran Qureshi",
  "Kavya Menon",
  "Rahul Verma",
  "Neha Gupta",
  "Aditya Joshi",
  "Meera Pillai",
  "Karan Malhotra",
  "Divya Shetty",
  "Siddharth Rao",
  "Pooja Desai",
  "Faizan Ahmed",
  "Lakshmi Narayanan",
  "Harpreet Kaur",
  "Tanvi Bhatt",
  "Rohit Bansal",
] as const;

/** Seed customers live in a reserved range so they never collide with a presenter's number. */
export const seedPhone = (index: number) => `9000000${String(index + 1).padStart(3, "0")}`;
