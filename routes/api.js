var express = require("express");
var router = express.Router();
const {
  userlogin,
  getFloorPlan,
  updateStateUser,
  deleteAccount,
  getFriendlistInHome,
  deleteUserInHome,
} = require("../services/db_api");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const e = require("express");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({
      Status: 0,
      Message: "No token provided",
      Error: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      Status: 0,
      Message: "Invalid or expired token",
      Error: err.message,
    });
  }
};

/* GET users listing. */
router.get("/", function (req, res, next) {
  res.send("respond with a resource");
});

router.post("/auth/Login", async (req, res) => {
  const { Username, Password } = req.body;

  try {
    if (!Username || !Password) {
      return res.json({
        Status: 0,
        Message: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (result.success) {
      if (!result.response.length) {
        return res.json({
          Status: 0,
          Message: "User not found",
          Error: "User not found",
        });
      }

      const user = result.response[0];
      const isMatch = await bcrypt.compare(Password, user.password);

      if (!isMatch) {
        return res.status(401).json({
          Status: 2,
          Message: "Invalid credentials",
          Error: "Invalid credentials",
        });
      }

      const payload = {
        user_id: user.id,
        username: user.username,
      };

      const accessToken = jwt.sign(
        payload,
        process.env.JWT_SECRET || "secretkey",
        { expiresIn: "1h" },
      );

      const refreshToken = jwt.sign(
        payload,
        process.env.JWT_REFRESH_SECRET || "refreshkey",
        { expiresIn: "7d" },
      );

      const response = {
        Message: "Login successful",
        token_type: "Bearer",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        Status: 1,
      };

      res.json(response);
    } else {
      res.status(401).json({
        Status: 0,
        Message: "Invalid credentials",
        Error: "Invalid credentials",
      });
    }
  } catch (err) {
    res.status(500).json({
      Status: 0,
      Message: "Server error",
      Error: err.message,
    });
  }
});

router.post("/v3/login", async (req, res) => {
  const { Username, Password } = req.body;

  try {
    if (!Username || !Password) {
      return res.json({
        Status: 0,
        Message: "Username or Password missing",
        Error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (result.success) {
      if (!result.response.length) {
        return res.json({
          Status: 0,
          Message: "User not found",
          Error: "User not found",
        });
      }

      const user = result.response[0];
      const isMatch = await bcrypt.compare(Password, user.password);

      if (!isMatch) {
        return res.status(401).json({
          Status: 2,
          Message: "Invalid credentials",
          Error: "Invalid credentials",
        });
      }

      const response = {
        Message: "Login successful",
        member: result.response[0],
        Status: 1,
        Error: null,
      };

      res.json(response);
    } else {
      res.status(401).json({
        Status: 0,
        Message: "Invalid credentials",
        Error: "Invalid credentials",
      });
    }
  } catch (err) {
    res
      .status(500)
      .json({ Status: 0, Message: "Server error", Error: err.message });
  }
});

///app/v3s/GetFloorPlan
router.post("/v3s/GetFloorPlan", verifyToken, async (req, res) => {
  const { MemberID } = req.body;

  try {
    const result = await getFloorPlan(MemberID);
    if (result.success) {
      console.log(result.response);

      res.json({ ...result.response, Message: "Success" });
    } else {
      res.status(401).json({
        Status: 0,
        Message: "Invalid credentials",
        Error: "Invalid credentials",
      });
    }
  } catch (err) {
    res
      .status(500)
      .json({ Status: 0, Message: "Server error", Error: err.message });
  }
});

///app/login
router.post("/login", async (req, res) => {
  try {
    const {
      Username,
      Password,
      Action,
      Platform,
      Enable,
      DevicesID,
      PlayerID,
    } = req.body;

    if (!Username || !Password) {
      return res.json({
        Status: 0,
        Message: "Username or Password missing",
        Error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (!result.response.length) {
      return res.json({
        Status: 0,
        Message: "User not found",
        Error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        Status: 2,
        Message: "Invalid credentials",
        Error: "Invalid credentials",
      });
    }

    return res.json({
      Status: 1,
      Message: "Login successful",
      Error: null,
    });
  } catch (err) {
    return res.status(500).json({
      Status: 0,
      Message: "Server error",
      Error: err.message,
    });
  }
});

//app/gettime
router.post("/gettime", async (req, res) => {
  try {
    return res.json({
      Status: 1,
      timer: new Date()
        .toLocaleString("en-US", {
          hour12: true,
        })
        .split(", ")
        .join(" "),
    });
  } catch (err) {
    return res.status(500).json({
      Status: 0,
      Message: "Server error",
    });
  }
});

//app/v3s/stateaccoun verifyToken
router.post("/v3s/stateaccoun", verifyToken, async (req, res) => {
  const { Username, Password, State } = req.body;
  try {
    if (!Username || !Password) {
      return res.json({
        Status: 0,
        Message: "Username or Password missing",
        Error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (!result.response.length) {
      return res.json({
        Status: 0,
        Message: "User not found",
        Error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        Status: 2,
        Message: "Invalid credentials",
        Error: "Invalid credentials",
      });
    }

    const updateResult = await updateStateUser(user.memberid, State);

    if (!updateResult.success) {
      return res.status(500).json({
        Status: 0,
        Message: updateResult.error.message || "Failed to update state",
        Error: updateResult.error,
      });
    }

    return res.json({
      Status: 1,
      Message: "State updated successfully",
      Error: null,
    });
  } catch (err) {
    return res.status(500).json({
      Status: 0,
      Message: err.message || "Server error",
      Error: err.message,
    });
  }
});

//app/v3s/deleteaccount
router.post("/v3s/deleteaccount", async (req, res) => {
  const { Username, Password, MemberID } = req.body;
  try {
    if (!Username || !Password) {
      return res.json({
        Status: 0,
        Message: "Username or Password missing",
        Error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (!result.response.length) {
      return res.json({
        Status: 0,
        Message: "User not found",
        Error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        Status: 2,
        Message: "Invalid credentials",
        Error: "Invalid credentials",
      });
    }

    const deleteAccResult = await deleteAccount(MemberID);

    if (!deleteAccResult.success) {
      return res.status(500).json({
        Status: 0,
        Message: deleteAccResult.error.message || "Failed to delete account",
        Error: deleteAccResult.error,
      });
    }

    return res.json({
      Status: 1,
      Message: "Account deleted successfully",
      Error: null,
    });
  } catch (err) {
    return res.status(500).json({
      Status: 0,
      Message: err.message || "Server error",
      Error: err.message,
    });
  }
});

router.post("/getfriendrolelist", async (req, res) => {
  const { MemberID, HomeID } = req.body;
  console.log(req.body);
  if (MemberID == null || HomeID == null) {
    return res.status(400).json({
      Status: 2,
      Message: "MemberID or HomeID missing",
      Error: "MemberID or HomeID missing",
    });
  }
  try {
    const friendRoles = await getFriendlistInHome(HomeID);
    if (friendRoles.success) {
      const found = friendRoles.response.find(
        (item) => item.memberid === MemberID.toString(),
      );
      if (!found) {
        return res.status(404).json({
          Status: 2,
          Message: "Member not found in friend list",
          Error: "Member not found in friend list",
        });
      } else if (found.role === 1) {
        return res.json({
          Status: 1,
          Message: "Success",
          FriendRoles: friendRoles.response.filter(
            (item) => item.memberid !== MemberID.toString(),
          ),
          Error: null,
        });
      } else {
        return res.status(403).json({
          Status: 2,
          Message: "Member does not have permission",
          Error: "Member does not have permission",
        });
      }
    } else {
      return res.status(500).json({
        Status: 2,
        Message: "Failed to retrieve friend roles",
        Error: "Failed to retrieve friend roles",
      });
    }
  } catch (err) {
    return res.status(500).json({
      Status: 2,
      Message: err.message || "Server error",
      Error: err.message,
    });
  }
});

///app/removefamily
router.post("/removefamily", async (req, res) => {
  const { MemberID, RequestID, HomeID } = req.body;
  if (MemberID == null || RequestID == null || HomeID == null) {
    return res.status(400).json({
      Status: 2,
      Message: "MemberID, RequestID or HomeID missing",
      Error: "MemberID, RequestID or HomeID missing",
    });
  }
  try {
    const deleteResult = await deleteUserInHome(MemberID, RequestID, HomeID);
    if (deleteResult.success) {
      return res.json({
        Status: 1,
        Message: "User removed from home successfully",
        Error: null,
      });
    } else {
      return res.status(200).json({
        Status: 2,
        Message:
        deleteResult.error.message || "Failed to remove user from home",
        Error: deleteResult.error,
      });
    }
  } catch (err) {
    return res.status(500).json({
      Status: 2,
      Message: err.message || "Server error",
      Error: err.message,
    });
  }
});

module.exports = router;
