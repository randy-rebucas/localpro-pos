import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  description?: string;
  tenantId: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Cascade delete protection: prevent deletion if products reference this category
async function checkCategoryDependencies(filter: Record<string, unknown>) {
  const doc = await mongoose.model('Category').findOne(filter).select('_id name tenantId').lean<{
    _id: mongoose.Types.ObjectId;
    name: string;
    tenantId: mongoose.Types.ObjectId;
  }>();
  if (!doc) return;

  // Tenant-scoped existence check (uses { tenantId, categoryId }) — stops at the first match
  const Product = mongoose.model('Product');
  const hasProduct = await Product.findOne({ tenantId: doc.tenantId, categoryId: doc._id })
    .select('_id')
    .lean();
  if (hasProduct) {
    throw new Error(
      `Cannot delete category "${doc.name}": products are assigned to this category. Reassign or remove them first.`
    );
  }
}

CategorySchema.pre('findOneAndDelete', async function (next) {
  try {
    await checkCategoryDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

CategorySchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  try {
    await checkCategoryDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Compound unique index for tenant and category name
CategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

const Category: Model<ICategory> = mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);

export default Category;

