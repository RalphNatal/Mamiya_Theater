export type Show = {
  id: string;
  title: string;
  price: number;
  ticketStatus: string;
  admission: string;
  image: string;
};

export const featuredShow = {
  id: '1',
  title: 'The Great Gatsby',
  label: 'SPOTLIGHT PERFORMANCE',
  description: "Immerse yourself in the roaring twenties. A spectacular new adaptation of F. Scott Fitzgerald's classic novel hits the main stage for a limited season. Don't miss the theatrical event of the year.",
};

export const nowShowing: Show[] = [
  {
    id: '1',
    title: 'The Phantom of the Opera',
    price: 45,
    ticketStatus: 'Select Dates Available',
    admission: 'Standard & VIP Admission',
    image: 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=400&q=80',
  },
  {
    id: '2',
    title: 'Wicked',
    price: 90,
    ticketStatus: 'Select Dates Available',
    admission: 'Standard & VIP Admission',
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80',
  },
  {
    id: '3',
    title: 'Hamilton',
    price: 120,
    ticketStatus: 'Select Dates Available',
    admission: 'Standard & VIP Admission',
    image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=400&q=80',
  },
  {
    id: '4',
    title: 'The Lion King',
    price: 70,
    ticketStatus: 'Select Dates Available',
    admission: 'Standard & VIP Admission',
    // Reliable unsplash lion dance / performance image
    image: 'https://images.unsplash.com/photo-1551818255-e6e10579a0ab?w=400&q=80',
  },
  {
    id: '5',
    title: 'Les Misérables',
    price: 85,
    ticketStatus: 'Select Dates Available',
    admission: 'Standard & VIP Admission',
    image: 'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=400&q=80',
  },
  {
    id: '6',
    title: 'Chicago',
    price: 80,
    ticketStatus: 'Select Dates Available',
    admission: 'Standard & VIP Admission',
    image: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400&q=80',
  },
];