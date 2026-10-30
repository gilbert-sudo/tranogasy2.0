import { Metadata } from 'next';
import CreateListingForm from '@/components/listing/CreateListingForm';

export const metadata: Metadata = {
  title: 'Créer une annonce - TranoGasy',
  description: 'Publiez votre bien immobilier en vente ou location à Madagascar sur TranoGasy.',
};

export default function CreateListingPage() {
  return <CreateListingForm />;
}

