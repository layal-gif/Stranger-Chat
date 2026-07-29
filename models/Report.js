"use strict";

const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporterSocketId: {
      type: String,
      required: true,
      maxlength: 100,
    },

    reportedSocketId: {
      type: String,
      required: true,
      maxlength: 100,
    },

    reporterNickname: {
      type: String,
      maxlength: 24,
      default: "Anonymous",
    },

    reportedNickname: {
      type: String,
      maxlength: 24,
      default: "Anonymous",
    },

    reason: {
      type: String,
      required: true,
      enum: [
        "Harassment",
        "Sexual content",
        "Spam",
        "Hate speech",
        "Underage user",
        "Other",
      ],
    },

    reporterCountry: {
      type: String,
      maxlength: 5,
      default: "",
    },

    reportedCountry: {
      type: String,
      maxlength: 5,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "reviewed", "dismissed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Report", reportSchema);