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
      index: true,
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
  const doc = await mongoose.model('Category').findOne(filter);
  if (!doc) return;

  const Product = mongoose.model('Product');
  const productCount = await Product.countDocuments({ categoryId: doc._id });
  if (productCount > 0) {
    throw new Error(
      `Cannot delete category "${doc.name}": ${productCount} product(s) are assigned to this category. Reassign or remove them first.`
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

