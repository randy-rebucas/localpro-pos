export type Testimonial = {
  /** The customer's own words, unedited. Shown as written in every language. */
  quote: string;
  name: string;
  /** For example "Owner, Santos Grocery". */
  role: string;
};

/**
 * Real customer quotes for the home page. The section stays hidden while this list is empty.
 *
 * Only add quotes from real customers who agreed to be named on the site. Never write
 * or reword one on a customer's behalf, because a made-up endorsement is false advertising.
 */
export const TESTIMONIALS: Testimonial[] = [];
