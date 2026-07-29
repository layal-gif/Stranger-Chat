"use strict";

const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema(
  {
    blockerDeviceId: {
      type: String,
      required: true,
      maxlength: 100,
      index: true,
    },

    blockedDeviceId: {
      type: String,
      required: true,
      maxlength: 100,
      index: true,
    },

    blockerNickname: {
      type: String,
      maxlength: 24,
      default: "Anonymous",
    },

    blockedNickname: {
      type: String,
      maxlength: 24,
      default: "Anonymous",
    },
  },
  {
    timestamps: true,
  }
);

blockSchema.index(
  {
    blockerDeviceId: 1,
    blockedDeviceId: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model("Block", blockSchema);