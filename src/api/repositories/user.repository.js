import { BATHER_ROLE_ID, PET_OWNER_ROLE_ID, VETERINARY_ROLE_ID } from '../../constants/database.js';
import { Clinic, User, UserRole } from '../models/index.js';

const createUser = async ({ userData }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    return newUser;
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const createVeterinary = async ({ userData }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    return newUser;
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const createPetOwner = async ({ userData }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    return newUser;
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const createAdmin = async ({ userData }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    return newUser;
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllVeterinaries = async () => {
  try {
    const veterinaries = await User.findAll({
      where: {
        role_id: VETERINARY_ROLE_ID,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return veterinaries;
  } catch (error) {
    throw new Error(`Error fetching veterinaries: ${error.message}`);
  }
};

const getAllPetOwners = async () => {
  try {
    const petOwners = await User.findAll({
      where: {
        role_id: PET_OWNER_ROLE_ID,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes: ['id', 'name', 'email', 'role_id', 'clinic_id', 'created_at'],
    });

    return petOwners;
  } catch (error) {
    throw new Error(`Error fetching pet owners: ${error.message}`);
  }
};

const getAllUsers = async () => {
  try {
    const users = await User.findAll({
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes: ['id', 'name', 'email', 'role_id', 'clinic_id', 'created_at'],
    });

    return users;
  } catch (error) {
    throw new Error(`Error fetching users: ${error.message}`);
  }
};

const getAllBathers = async ({ clinic_id }) => {
  console.log();
  try {
    const bathers = await User.findAll({
      where: {
        role_id: BATHER_ROLE_ID,
        clinic_id: clinic_id,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes: ['id', 'name', 'email', 'role_id', 'clinic_id', 'created_at'],
    });

    return bathers;
  } catch (error) {
    throw new Error(`Error fetching bathers: ${error.message}`);
  }
};

const getUserByEmail = async ({ email, password = false }) => {
  try {
    const attributes = ['id', 'name', 'email', 'role_id', 'clinic_id', 'created_at'];

    if (password) {
      attributes.push('password');
    }

    const user = await User.findOne({
      where: { email },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes,
      nest: true,
    });

    return user;
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(`Error fetching user by email: ${error.message}`);
  }
};

const getVeterinaryById = async ({ id }) => {
  try {
    const veterinary = await User.findOne({
      where: {
        id,
        role_id: VETERINARY_ROLE_ID,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes: ['id', 'name', 'email', 'role_id', 'clinic_id', 'created_at'],
    });

    return veterinary;
  } catch (error) {
    throw new Error(`Error fetching veterinary by id: ${error.message}`);
  }
};

const getPetOwnerById = async ({ id }) => {
  try {
    const petOwner = await User.findOne({
      where: {
        id,
        role_id: PET_OWNER_ROLE_ID,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: UserRole,
          as: 'role',
          attributes: ['id', 'role'],
        },
      ],
      attributes: ['id', 'name', 'email', 'role_id', 'clinic_id', 'created_at'],
    });

    return petOwner;
  } catch (error) {
    throw new Error(`Error fetching pet owner by id: ${error.message}`);
  }
};

export default {
  createUser,
  createVeterinary,
  createPetOwner,
  createAdmin,
  getAllVeterinaries,
  getAllPetOwners,
  getAllUsers,
  getAllBathers,
  getUserByEmail,
  getVeterinaryById,
  getPetOwnerById,
};
