import BookingPage from "@/components/booking-page";
export const metadata = { title: "Book a call" };
export default async function Book({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BookingPage token={token} />;
}
