var express = require("express");
var axios = require("axios");
var router = express.Router();
const { v4: uuidv4 } = require("uuid");
const {
  userlogin,
  getFloorPlan,
  updateStateUser,
  deleteAccount,
  getFriendlistInHome,
  deleteUserInHome,
  getRoleInformation,
  changeUsername,
  memberIDlogin,
  changeMemberName,
  changeUserPassword,
  addmapfriendly,
  changeHomename
} = require("../services/db_api");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const e = require("express");
const { login } = require("../services/db_work");

const StatusCode = {
  FAIL: 0, // system fail / unknown error
  SUCCESS: 1, // success
  INVALID: 2, // validation / business fail
  UNAUTHORIZED: 3, // auth fail
  SERVER_ERROR: 4, // DB / internal error
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(200).json({
      status: StatusCode.UNAUTHORIZED,
      message: "No token provided",
      error: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    //console.log(decoded);

    req.user = decoded;

    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      console.log(" Invalid signature (JWT_SECRET ผิด หรือ token ถูกแก้)");
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid signature token",
        error: err.message,
      });
    } else if (err.name === "TokenExpiredError") {
      console.log("Token หมดอายุ");
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "expired token",
        error: err.message,
      });
    } else {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid or expired token",
        error: err.message,
      });
    }

    return res.status(401).json({ message: "Unauthorized" });
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
        status: StatusCode.INVALID,
        message: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (result.success) {
      if (!result.response.length) {
        return res.json({
          status: StatusCode.INVALID,
          message: "User not found",
          error: "User not found",
        });
      }

      const user = result.response[0];
      const isMatch = await bcrypt.compare(Password, user.password);

      if (!isMatch) {
        return res.status(200).json({
          status: StatusCode.INVALID,
          message: "Invalid credentials",
          error: "Invalid credentials",
        });
      }

      const payload = {
        id: uuidv4(),
        Member: user.memberid,
        Username: user.username,
        Member: user.Member,
        Name: user.Name,
        Email: user.Email,
        Gateway: user.devicetype != 1 ? user.id : 0,
        User: `${user.username}.${user.username}`,
        Scopes: [],
        Roles: ["Member", "Monitor"],
        AdminRole: 0,
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
        message: "Login successful",
        token_type: "Bearer",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        status: 1,
      };

      res.status(200).json(response);
    } else {
      res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }
  } catch (err) {
    res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: "Server error",
      error: err.message,
    });
  }
});

router.post("/v3/login", async (req, res) => {
  const { Username, Password } = req.body;

  try {
    if (!Username || !Password) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Username or Password missing",
        error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (result.success) {
      if (!result.response.length) {
        return res.status(200).json({
          status: StatusCode.INVALID,
          message: "User not found",
          error: "User not found",
        });
      }

      const user = result.response[0];
      const isMatch = await bcrypt.compare(Password, user.password);

      if (!isMatch) {
        return res.status(200).json({
          status: StatusCode.INVALID,
          message: "Invalid credentials",
          error: "Invalid credentials",
        });
      }

      const response = {
        message: "Login successful",
        //member: result.response[0],
        member: {
          memberid: result.response[0].memberid,
          owner: result.response[0].owner,
          devicetype: result.response[0].devicetype,
          username: result.response[0].username,
          membername: result.response[0].membername,
          email: result.response[0].email,
          mobilephone: result.response[0].mobilephone,
          img: result.response[0].img,
          created: result.response[0].created,
          state: result.response[0].state,
          description: result.response[0].description,
        },
        status: StatusCode.SUCCESS,
        error: null,
      };

      res.json(response);
    } else {
      res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }
  } catch (err) {
    res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: "Server error",
      error: err.message,
    });
  }
});

///app/v3s/GetFloorPlan
router.post("/v3s/GetFloorPlan", verifyToken, async (req, res) => {
  const { MemberID } = req.body;

  try {
    const result = await getFloorPlan(MemberID);
    if (result.success) {
      res.status(200).json({ ...result.response, Message: "Success" });
    } else {
      res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }
  } catch (err) {
    res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: "Server error",
      error: err.message,
    });
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
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Username or Password missing",
        error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (!result.response.length) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "User not found",
        error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }

    return res.status(200).json({
      status: StatusCode.SUCCESS,
      message: "Login successful",
      error: null,
    });
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: "Server error",
      error: err.message,
    });
  }
});

////app/devices
router.post("/devices", async (req, res) => {
  try {
    const { Action, Enable, MemberID, DevicesID, PlayerID } = req.body;

    return res.status(200).json({
      status: StatusCode.SUCCESS,
      message: "Login successful",
      error: null,
    });
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: "Server error",
      error: err.message,
    });
  }
});

//app/gettime
router.post("/gettime", async (req, res) => {
  try {
    return res.status(200).json({
      status: StatusCode.SUCCESS,
      timer: new Date()
        .toLocaleString("en-US", {
          hour12: true,
        })
        .split(", ")
        .join(" "),
    });
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: "Server error",
      error: err.message,
    });
  }
});

//app/v3s/stateaccoun verifyToken
router.post("/v3s/stateaccoun", verifyToken, async (req, res) => {
  const { Username, Password, State } = req.body;
  try {
    if (!Username || !Password) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Username or Password missing",
        error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (!result.response.length) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "User not found",
        error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }

    const updateResult = await updateStateUser(user.memberid, State);

    if (!updateResult.success) {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: updateResult.error.message || "Failed to update state",
        error: updateResult.error,
      });
    }

    return res.status(200).json({
      status: StatusCode.SUCCESS,
      message: "State updated successfully",
      error: null,
    });
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

//app/v3s/deleteaccount
router.post("/v3s/deleteaccount", verifyToken, async (req, res) => {
  const { Username, Password, MemberID } = req.body;
  try {
    if (!Username || !Password) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Username or Password missing",
        error: "Username or Password missing",
      });
    }

    const result = await userlogin(Username);

    if (!result.response.length) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "User not found",
        error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }

    const deleteAccResult = await deleteAccount(MemberID);

    if (!deleteAccResult.success) {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: deleteAccResult.error.message || "Failed to delete account",
        error: deleteAccResult.error,
      });
    }

    return res.status(200).json({
      status: StatusCode.SUCCESS,
      message: "Account deleted successfully",
      error: null,
    });
  } catch (err) {
    return res.status(200).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

router.post("/getfriendrolelist", verifyToken, async (req, res) => {
  const { MemberID, HomeID } = req.body;
  if (MemberID == null || HomeID == null) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "MemberID or HomeID missing",
      error: "MemberID or HomeID missing",
    });
  }
  try {
    const friendRoles = await getFriendlistInHome(HomeID);
    if (friendRoles.success) {
      const found = friendRoles.response.find(
        (item) => item.memberid === MemberID.toString(),
      );
      if (!found) {
        return res.status(200).json({
          status: StatusCode.NOT_FOUND,
          message: "Member not found in friend list",
          error: "Member not found in friend list",
        });
      } else if (found.role === 1) {
        return res.status(200).json({
          status: StatusCode.SUCCESS,
          message: "Success",
          friendRoles: friendRoles.response.filter(
            (item) => item.memberid !== MemberID.toString(),
          ),
          error: null,
        });
      } else {
        return res.status(200).json({
          status: StatusCode.FORBIDDEN,
          message: "Member does not have permission",
          error: "Member does not have permission",
        });
      }
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: "Failed to retrieve friend roles",
        error: "Failed to retrieve friend roles",
      });
    }
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

///app/removefamily
router.post("/removefamily", verifyToken, async (req, res) => {
  const { MemberID, RequestID, HomeID } = req.body;

  if (MemberID == null || RequestID == null || HomeID == null) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "MemberID, RequestID or HomeID missing",
      error: "MemberID, RequestID or HomeID missing",
    });
  }
  try {
    const deleteResult = await deleteUserInHome(MemberID, RequestID, HomeID);
    if (deleteResult.success) {
      console.log(`removefamily.res:${JSON.stringify(deleteResult)}`);

      axios
        .post("http://127.0.0.1:5001/api/tenantupdate", {
          memberid: MemberID,
          gatewayid: HomeID,
          action: "remove",
        })
        .then(() => {
          return res.status(200).json({
            status: StatusCode.SUCCESS,
            Message: "Success",
            //Role: deleteResult.response[0] ? deleteResult.response[0].role : 0,
          });
        })
        .catch((error) => {
          console.log(`removefamily.error:${error}`);

          return res.status(200).json({
            status: StatusCode.SERVER_ERROR,
            message: error || "axios error",
            error: error,
            err: "c",
          });
        });
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message:
          deleteResult.error.message || "Failed to remove user from home",
        error: deleteResult.error,
        err: "b",
      });
    }
  } catch (err) {
    console.log(`removefamily.catch:${err}`);
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
      err: "a",
    });
  }
});

///app/getroleinformation
router.post("/getroleinformation", verifyToken, async (req, res) => {
  const { MemberID, HomeID } = req.body;
  if (MemberID == null || HomeID == null) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "MemberID or HomeID missing",
      error: "MemberID or HomeID missing",
    });
  }
  try {
    const deleteResult = await getRoleInformation(MemberID, HomeID);
    if (deleteResult.success) {
      return res.status(200).json({
        status: StatusCode.SUCCESS,
        message: "Success",
        role: deleteResult.response[0] ? deleteResult.response[0].role : 0,
      });
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: "Failed",
        role: 0,
      });
    }
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

///app/changeusername
router.post("/changeusername", verifyToken, async (req, res) => {
  const { MemberID, Username, Password } = req.body;

  if (MemberID == null || Username == null || Password == null) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "MemberID, Username or Password missing",
      error: "MemberID, Username or Password missing",
    });
  }
  try {
    const result = await memberIDlogin(MemberID);

    if (!result.response.length) {
      return res.status(200).json({
        status: StatusCode.UNAUTHORIZED,
        message: "User not found",
        error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(Password, user.password);

    if (!isMatch) {
      return res.status(200).json({
        status: StatusCode.UNAUTHORIZED,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }

    const changeUsernameResult = await changeUsername(MemberID, Username);

    if (changeUsernameResult.success) {
      return res.status(200).json({
        status: StatusCode.SUCCESS,
        message: "Success",
      });
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: "Failed",
      });
    }
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

// /app/changemembername
router.post("/changemembername", verifyToken, async (req, res) => {
  try {
    const { MemberID, Name } = req.body;

    if (MemberID == null || Name == null) {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: "MemberID or Name missing",
        error: "MemberID or Name missing",
      });
    }

    const changeResult = await changeMemberName(MemberID, Name);

    if (changeResult.success) {
      return res.status(200).json({
        status: StatusCode.SUCCESS,
        message: "Success",
      });
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: "Failed",
        error: changeResult.error,
      });
    }
  } catch (err) {
    return res.status(500).json({
      status: 4,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

///app/changepassword
router.post("/changepassword", verifyToken, async (req, res) => {
  const { MemberID, CurrentPassword, NewPassword } = req.body;
  console.log(MemberID, CurrentPassword, NewPassword);

  if (MemberID == null || CurrentPassword == null || NewPassword == null) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "MemberID, CurrentPassword or NewPassword missing",
      error: "MemberID, CurrentPassword or NewPassword missing",
    });
  }
  try {
    const result = await memberIDlogin(MemberID);

    if (!result.response.length) {
      return res.status(200).json({
        status: StatusCode.UNAUTHORIZED,
        message: "User not found",
        error: "User not found",
      });
    }

    const user = result.response[0];
    const isMatch = await bcrypt.compare(CurrentPassword, user.password);

    if (!isMatch) {
      return res.status(200).json({
        status: StatusCode.UNAUTHORIZED,
        message: "Invalid credentials",
        error: "Invalid credentials",
      });
    }

    const changePasswordResult = await changeUserPassword(
      MemberID,
      NewPassword,
    );

    if (changePasswordResult.success) {
      return res.status(200).json({
        status: StatusCode.SUCCESS,
        message: "Success",
      });
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: "Failed",
        error: changePasswordResult.error,
      });
    }
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

//app/changehomename
router.post("/changehomename", verifyToken, async (req, res) => {
  const { MemberID, HomeID, Name } = req.body;
  if (MemberID == null || HomeID == null || Name == null) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "MemberID, HomeID or Name missing",
      error: "MemberID, HomeID or Name missing",
    });
  }

  try {
    const changeHomenameResult = await changeHomename(MemberID, HomeID, Name);

    if (changeHomenameResult.success) {
      return res.status(200).json({
        status: StatusCode.SUCCESS,
        message: "Success",
      });
    } else {
      return res.status(200).json({
        status: StatusCode.SERVER_ERROR,
        message: "Failed",
        error: changeHomenameResult.error,
      });
    }
  } catch  (err){
    return res.status(500).json({
      status: StatusCode.SERVER_ERROR,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

//  /app/mapfriendly
router.post("/mapfriendly", verifyToken, async (req, res) => {
  const { Name, MemberID, GatewayID, Role, DateTimeExpired } = req.body;

  if (
    Name == null ||
    MemberID == null ||
    GatewayID == null ||
    Role == null ||
    DateTimeExpired == null
  ) {
    return res.status(200).json({
      status: StatusCode.INVALID,
      message: "One or more required fields are missing",
      error: "One or more required fields are missing",
    });
  }
  try {
    const result = await addmapfriendly(MemberID, GatewayID, Role);
    console.log(new Date().toUTCString());
    if (result.success) {
      if (result.response.length > 0) {
        axios
          .post("http://127.0.0.1:5001/app/tenantupdate", {
            memberid: MemberID,
            gatewayid: GatewayID,
            action: "add",
          })
          .then(() => {
            return res.status(200).json({
              status: StatusCode.SUCCESS,
              Message: "Success",
              Role: result.response[0] ? result.response[0].role : 0,
            });
          })
          .catch((error) => {
            return res.status(200).json({
              status: StatusCode.SERVER_ERROR,
              message: error || "Server error",
              error: error,
            });
          });
      } else {
        return res.status(200).json({
          status: StatusCode.SERVER_ERROR,
          message: "Failed to add map friendly",
          error: "Failed to add map friendly",
        });
      }
    } else {
      return res.status(200).json({
        status: StatusCode.INVALID,
        message: result.error || "Failed to add map friendlys",
        role: 0,
      });
    }
    // await new Promise((r) => setTimeout(r, 5000)).then(() => {
    //   console.log(new Date().toUTCString());
    //   if (result.success) {
    //     if (result.response.length > 0) {
    //       axios
    //         .post("http://192.168.1.20:5001/app/tenantupdate", {
    //           memberid: MemberID,
    //           gatewayid: GatewayID,
    //           role: Role,
    //           action: "add"
    //         })
    //         .then(() => {
    //           return res.status(200).json({
    //             status: StatusCode.SUCCESS,
    //             Message: "Success",
    //             Role: result.response[0] ? result.response[0].role : 0,
    //           });
    //         })
    //         .catch((error) => {
    //           return res.status(200).json({
    //             status: StatusCode.SERVER_ERROR,
    //             message: error || "Server error",
    //             error: error,
    //           });
    //         });
    //     } else {
    //       return res.status(200).json({
    //         status: StatusCode.SERVER_ERROR,
    //         message: "Failed to add map friendly",
    //         error: "Failed to add map friendly",
    //       });
    //     }
    //   } else {
    //     return res.status(200).json({
    //       status: StatusCode.INVALID,
    //       message: result.error || "Failed to add map friendlys",
    //       role: 0,
    //     });
    //   }
    // });
  } catch (err) {
    return res.status(500).json({
      status: StatusCode.INVALID,
      message: err.message || "Server error",
      error: err.message,
    });
  }
});

module.exports = router;
