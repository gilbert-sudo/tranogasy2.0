import { Metadata } from 'next';
import CreateListingForm from '@/components/listing/CreateListingForm';

export const metadata: Metadata = {
  title: 'Créer une annonce - TranoGasy',
  description: 'Publiez votre maison en location à Madagascar sur TranoGasy.',
};

export default function CreateListingPage() {
  return <CreateListingForm />;
}
