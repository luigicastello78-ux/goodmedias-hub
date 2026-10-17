import type { Metadata } from "next";

import { ContactsWorkspace } from "@/components/contacts/contacts-workspace";

export const metadata: Metadata = { title: "Contacts" };

const ContactsPage = () => {
  return <ContactsWorkspace />;
};

export default ContactsPage;
