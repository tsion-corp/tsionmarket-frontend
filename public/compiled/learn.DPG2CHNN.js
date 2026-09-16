import {
  Coords
} from "./lib.CHCAIC5O.js";
import "./lib.67VUYMDO.js";
import "./lib.GD6YSPBF.js";
import {
  numberSpread
} from "./lib.EAANXKAK.js";
import {
  a,
  button,
  confirm,
  div,
  h1,
  h2,
  icon,
  img,
  p,
  span
} from "./lib.MYPIOGN5.js";
import {
  fenColor
} from "./lib.LRP46MC3.js";
import {
  shuffle
} from "./lib.HMFK7OOB.js";
import {
  Chessground
} from "./lib.AEOHBIQD.js";
import {
  key2pos,
  opposite as opposite2
} from "./lib.RPQH5UYI.js";
import "./lib.XAEDCBGD.js";
import {
  Antichess,
  Chess,
  chessgroundDests,
  makeBoardFen,
  makeSan,
  parseFen
} from "./lib.X7H2PLEK.js";
import {
  charToRole,
  makeSquare,
  makeUci,
  opposite,
  parseSquare
} from "./lib.53PYQRAK.js";
import "./lib.CAO7TYYH.js";
import "./lib.PNHYIP7B.js";
import {
  bind,
  isSafari,
  onInsert
} from "./lib.S3TIZ2HQ.js";
import {
  attributesModule,
  classModule,
  eventListenersModule,
  h,
  init,
  propsModule,
  styleModule
} from "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  form,
  jsonAnyResponse
} from "./lib.TT4QSUKQ.js";
import {
  storage
} from "./lib.NFSQQWN5.js";
import {
  prop,
  propWithEffect
} from "./lib.GMEH5BEF.js";
import "./lib.KO2KTNGK.js";

// ../learn/src/hashRouting.ts
var BASE_LEARN_PATH = "/learn";
var hashNavigate = (stageId2, levelId) => {
  let hashPath = "";
  if (typeof stageId2 === "number") hashPath += `/${stageId2}`;
  if (typeof levelId === "number") hashPath += `/${levelId}`;
  window.location.hash = hashPath;
};
var hashHref = (stageId2, levelId) => {
  let href = BASE_LEARN_PATH;
  if (typeof stageId2 === "number") {
    href += `#/${stageId2}`;
    if (typeof levelId === "number") href += "/" + levelId;
  }
  return href;
};
var extractHashParameters = () => {
  const hash = window.location.hash;
  if (!hash) return { stageId: null, levelId: null };
  const parts = hash.split("/");
  const nanToNull = (n) => isNaN(n) ? null : n;
  return { stageId: nanToNull(parseInt(parts[1], 10)), levelId: nanToNull(parseInt(parts[2], 10)) };
};

// ../learn/src/apple.ts
var svg = (key) => `<g class="apple" transform-origin="50 50"><g transform="scale(4.15 4.15)"><g><path d="M12.52 3.06287L15.1485 8.3943C15.1828 8.46858 15.2571 8.52001 15.3371 8.53144L21.2171 9.38858C21.6914 9.45715 21.88 10.04 21.5371 10.3772L17.4057 14.4C17.2685 14.5314 17.2057 14.7257 17.24 14.9143L18.2171 20.6C18.2971 21.0743 17.8 21.4343 17.3771 21.2114L12.1143 18.4457C12.04 18.4057 11.9543 18.4057 11.88 18.4457L6.61712 21.2114C6.19426 21.4343 5.69712 21.0743 5.77712 20.6L6.78855 14.7429C6.79998 14.6629 6.77712 14.5772 6.71426 14.52L2.46283 10.3714C2.11998 10.0343 2.30855 9.45144 2.78283 9.38287L8.66283 8.52572C8.74283 8.5143 8.81712 8.46287 8.85141 8.38858L11.48 3.05715C11.6914 2.6343 12.3085 2.6343 12.52 3.06287Z" fill="url(#paint0_radial${key})"></path><path d="M5.54855 12.1828C4.44569 11.08 2.88569 9.82283 3.21141 9.32568L2.78283 9.38854C2.30855 9.45711 2.11998 10.04 2.46283 10.3771L6.71998 14.5257C6.77712 14.5828 6.80569 14.6685 6.79426 14.7485C6.94283 13.7085 6.6514 13.28 5.54855 12.1828Z" fill="url(#paint1_radial${key})"></path><path d="M18.4514 12.1828C19.5543 11.08 21.1143 9.82283 20.7885 9.32568L21.2171 9.38854C21.6914 9.45711 21.88 10.04 21.5371 10.3771L17.28 14.5257C17.2228 14.5828 17.1943 14.6685 17.2057 14.7485C17.0571 13.7085 17.3485 13.28 18.4514 12.1828Z" fill="url(#paint2_radial${key})"></path><path d="M21.2173 9.3887L15.3373 8.53156C15.2573 8.52013 15.183 8.4687 15.1487 8.39442L12.5201 3.06299C12.5201 3.06299 12.2801 3.36013 12.823 4.49156C13.1773 5.2287 14.1087 7.26299 14.6173 8.31442C14.903 8.9087 15.3373 8.92013 15.9944 9.00585L20.3373 9.56013C20.3316 9.56585 20.8116 9.60585 21.2173 9.3887Z" fill="url(#paint3_radial${key})"></path><path d="M12.52 3.06287L15.1485 8.3943C15.1828 8.46858 15.2571 8.52001 15.3371 8.53144L21.2171 9.38858C21.6914 9.45715 21.88 10.04 21.5371 10.3772L17.4057 14.4C17.2685 14.5314 17.2057 14.7257 17.24 14.9143L18.2171 20.6C18.2971 21.0743 17.8 21.4343 17.3771 21.2114L12.1143 18.4457C12.04 18.4057 11.9543 18.4057 11.88 18.4457L6.61712 21.2114C6.19426 21.4343 5.69712 21.0743 5.77712 20.6L6.78855 14.7429C6.79998 14.6629 6.77712 14.5772 6.71426 14.52L2.46283 10.3714C2.11998 10.0343 2.30855 9.45144 2.78283 9.38287L8.66283 8.52572C8.74283 8.5143 8.81712 8.46287 8.85141 8.38858L11.48 3.05715C11.6914 2.6343 12.3085 2.6343 12.52 3.06287Z" fill="url(#paint4_radial${key})"></path><path d="M12.52 3.06287L15.1485 8.3943C15.1828 8.46858 15.2571 8.52001 15.3371 8.53144L21.2171 9.38858C21.6914 9.45715 21.88 10.04 21.5371 10.3772L17.4057 14.4C17.2685 14.5314 17.2057 14.7257 17.24 14.9143L18.2171 20.6C18.2971 21.0743 17.8 21.4343 17.3771 21.2114L12.1143 18.4457C12.04 18.4057 11.9543 18.4057 11.88 18.4457L6.61712 21.2114C6.19426 21.4343 5.69712 21.0743 5.77712 20.6L6.78855 14.7429C6.79998 14.6629 6.77712 14.5772 6.71426 14.52L2.46283 10.3714C2.11998 10.0343 2.30855 9.45144 2.78283 9.38287L8.66283 8.52572C8.74283 8.5143 8.81712 8.46287 8.85141 8.38858L11.48 3.05715C11.6914 2.6343 12.3085 2.6343 12.52 3.06287Z" fill="url(#paint5_radial${key})"></path><path d="M11.48 3.06287L8.85141 8.3943C8.81712 8.46858 8.74283 8.52001 8.66283 8.53144L2.78283 9.38858C2.30855 9.45715 2.11998 10.04 2.46283 10.3772L6.59426 14.4C6.73141 14.5314 6.79426 14.7257 6.75998 14.9143L5.78283 20.6C5.70283 21.0743 6.19998 21.4343 6.62283 21.2114L11.8857 18.4457C11.96 18.4057 12.0457 18.4057 12.12 18.4457L17.3828 21.2114C17.8057 21.4343 18.3028 21.0743 18.2228 20.6L17.2114 14.7429C17.2 14.6629 17.2228 14.5772 17.2857 14.52L21.5428 10.3714C21.8857 10.0343 21.6971 9.45144 21.2228 9.38287L15.3428 8.52572C15.2628 8.5143 15.1885 8.46287 15.1543 8.38858L12.5257 3.05715C12.3085 2.6343 11.6914 2.6343 11.48 3.06287Z" fill="url(#paint6_radial${key})"></path><path d="M11.48 3.06287L8.85141 8.3943C8.81712 8.46858 8.74283 8.52001 8.66283 8.53144L2.78283 9.38858C2.30855 9.45715 2.11998 10.04 2.46283 10.3772L6.59426 14.4C6.73141 14.5314 6.79426 14.7257 6.75998 14.9143L5.78283 20.6C5.70283 21.0743 6.19998 21.4343 6.62283 21.2114L11.8857 18.4457C11.96 18.4057 12.0457 18.4057 12.12 18.4457L17.3828 21.2114C17.8057 21.4343 18.3028 21.0743 18.2228 20.6L17.2114 14.7429C17.2 14.6629 17.2228 14.5772 17.2857 14.52L21.5428 10.3714C21.8857 10.0343 21.6971 9.45144 21.2228 9.38287L15.3428 8.52572C15.2628 8.5143 15.1885 8.46287 15.1543 8.38858L12.5257 3.05715C12.3085 2.6343 11.6914 2.6343 11.48 3.06287Z" fill="url(#paint7_radial${key})"></path><path opacity="0.24" d="M11.48 3.06287L8.85141 8.3943C8.81712 8.46858 8.74283 8.52001 8.66283 8.53144L2.78283 9.38858C2.30855 9.45715 2.11998 10.04 2.46283 10.3772L6.59426 14.4C6.73141 14.5314 6.79426 14.7257 6.75998 14.9143L5.78283 20.6C5.70283 21.0743 6.19998 21.4343 6.62283 21.2114L11.8857 18.4457C11.96 18.4057 12.0457 18.4057 12.12 18.4457L17.3828 21.2114C17.8057 21.4343 18.3028 21.0743 18.2228 20.6L17.2114 14.7429C17.2 14.6629 17.2228 14.5772 17.2857 14.52L21.5428 10.3714C21.8857 10.0343 21.6971 9.45144 21.2228 9.38287L15.3428 8.52572C15.2628 8.5143 15.1885 8.46287 15.1543 8.38858L12.5257 3.05715C12.3085 2.6343 11.6914 2.6343 11.48 3.06287Z" fill="url(#paint8_radial${key})"></path><path opacity="0.24" d="M11.48 3.06287L8.85141 8.3943C8.81712 8.46858 8.74283 8.52001 8.66283 8.53144L2.78283 9.38858C2.30855 9.45715 2.11998 10.04 2.46283 10.3772L6.59426 14.4C6.73141 14.5314 6.79426 14.7257 6.75998 14.9143L5.78283 20.6C5.70283 21.0743 6.19998 21.4343 6.62283 21.2114L11.8857 18.4457C11.96 18.4057 12.0457 18.4057 12.12 18.4457L17.3828 21.2114C17.8057 21.4343 18.3028 21.0743 18.2228 20.6L17.2114 14.7429C17.2 14.6629 17.2228 14.5772 17.2857 14.52L21.5428 10.3714C21.8857 10.0343 21.6971 9.45144 21.2228 9.38287L15.3428 8.52572C15.2628 8.5143 15.1885 8.46287 15.1543 8.38858L12.5257 3.05715C12.3085 2.6343 11.6914 2.6343 11.48 3.06287Z" fill="url(#paint9_radial${key})"></path><path d="M2.78271 9.3887L8.66272 8.53156C8.74272 8.52013 8.817 8.4687 8.85129 8.39442L11.4799 3.06299C11.4799 3.06299 11.7199 3.36013 11.177 4.49156C10.8227 5.2287 9.89129 7.26299 9.38272 8.31442C9.097 8.9087 8.66272 8.92013 8.00557 9.00585L3.66271 9.56013C3.66843 9.56585 3.18843 9.60585 2.78271 9.3887Z" fill="url(#paint10_radial${key})"></path><path opacity="0.5" d="M12.52 3.06287L15.1485 8.3943C15.1828 8.46858 15.2571 8.52001 15.3371 8.53144L21.2171 9.38858C21.6914 9.45715 21.88 10.04 21.5371 10.3772L17.4057 14.4C17.2685 14.5314 17.2057 14.7257 17.24 14.9143L18.2171 20.6C18.2971 21.0743 17.8 21.4343 17.3771 21.2114L12.1143 18.4457C12.04 18.4057 11.9543 18.4057 11.88 18.4457L6.61712 21.2114C6.19426 21.4343 5.69712 21.0743 5.77712 20.6L6.78855 14.7429C6.79998 14.6629 6.77712 14.5772 6.71426 14.52L2.46283 10.3714C2.11998 10.0343 2.30855 9.45144 2.78283 9.38287L8.66283 8.52572C8.74283 8.5143 8.81712 8.46287 8.85141 8.38858L11.48 3.05715C11.6914 2.6343 12.3085 2.6343 12.52 3.06287Z" fill="url(#paint11_radial${key})"></path><path d="M18.2171 20.6001L17.24 14.9144C17.2057 14.7258 17.2685 14.5373 17.4057 14.4001L21.5371 10.3716C21.88 10.0344 21.6914 9.45155 21.2171 9.38298L15.3371 8.52584C15.2571 8.51441 15.1828 8.46298 15.1485 8.3887L12.52 3.05727C12.3085 2.6287 11.6971 2.6287 11.48 3.05727L8.85141 8.3887C8.81712 8.46298 8.74283 8.51441 8.66283 8.52584L2.78283 9.38298C2.30855 9.45155 2.11998 10.0344 2.46283 10.3716L6.71998 14.5201C6.77712 14.5773 6.80569 14.663 6.79426 14.743L5.78283 20.6001C5.70283 21.0744 6.19998 21.4344 6.62283 21.2116L11.8857 18.4458C11.96 18.4058 12.0457 18.4058 12.12 18.4458L17.3828 21.2116C17.8 21.4344 18.2971 21.0744 18.2171 20.6001ZM17.7943 20.8973C17.7543 20.9258 17.6571 20.983 17.5314 20.9144L12.2743 18.1487C12.1885 18.103 12.0971 18.0801 12.0057 18.0801C11.9143 18.0801 11.8228 18.103 11.7371 18.1487L6.47998 20.9144C6.35426 20.9773 6.25712 20.9201 6.21712 20.8973C6.17712 20.8687 6.09141 20.7887 6.11998 20.6516L7.11426 14.8001C7.14855 14.6116 7.08569 14.423 6.94855 14.2858L2.69141 10.1373C2.58855 10.0401 2.61141 9.92584 2.62855 9.88013C2.64569 9.83441 2.69141 9.73155 2.82855 9.7087L8.70855 8.85155C8.89712 8.82298 9.06283 8.70298 9.14283 8.53727L11.7714 3.20584C11.8343 3.08013 11.9485 3.0687 11.9943 3.0687C12.04 3.0687 12.1543 3.08013 12.2171 3.20584L14.8457 8.53727C14.9314 8.7087 15.0914 8.8287 15.28 8.85155L21.16 9.7087C21.2971 9.73155 21.3485 9.83441 21.36 9.88013C21.3771 9.92584 21.4 10.0401 21.2971 10.1373L17.1657 14.1658C16.9543 14.3716 16.8571 14.6744 16.9028 14.9658L17.88 20.6516C17.9143 20.7944 17.8285 20.8744 17.7943 20.8973Z" fill="url(#paint12_radial${key})"></path><defs><radialGradient id="paint0_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.5169 10.0777) scale(9.49336)"><stop stop-color="#FFE343"></stop><stop offset="0.5492" stop-color="#FFE241"></stop><stop offset="0.7469" stop-color="#FFDF3A"></stop><stop offset="0.8874" stop-color="#FEDA2F"></stop><stop offset="1" stop-color="#FED31E"></stop></radialGradient><radialGradient id="paint1_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(4.49599 13.8245) rotate(-39.4857) scale(1.75579 4.72781)"><stop stop-color="#D86D00"></stop><stop offset="0.3292" stop-color="#DC6C0A" stop-opacity="0.6708"></stop><stop offset="0.8792" stop-color="#E86823" stop-opacity="0.1208"></stop><stop offset="1" stop-color="#EB672A" stop-opacity="0"></stop></radialGradient><radialGradient id="paint2_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(19.2812 14.0812) rotate(-140.514) scale(1.75579 4.72781)"><stop stop-color="#D86D00"></stop><stop offset="0.3292" stop-color="#DC6C0A" stop-opacity="0.6708"></stop><stop offset="0.8792" stop-color="#E86823" stop-opacity="0.1208"></stop><stop offset="1" stop-color="#EB672A" stop-opacity="0"></stop></radialGradient><radialGradient id="paint3_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(18.0285 4.69362) rotate(46.8275) scale(6.8756 4.73243)"><stop stop-color="#ED9900"></stop><stop offset="1" stop-color="#ED9900" stop-opacity="0"></stop></radialGradient><radialGradient id="paint4_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.2624 9.07147) rotate(-41.4123) scale(5.46203 2.99319)"><stop stop-color="#FFEC5F"></stop><stop offset="1" stop-color="#FFEC5F" stop-opacity="0"></stop></radialGradient><radialGradient id="paint5_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(9.62409 21.2697) rotate(-26.3216) scale(5.21989 2.47385)"><stop stop-color="#D86D00"></stop><stop offset="0.3292" stop-color="#DC6C0A" stop-opacity="0.6708"></stop><stop offset="0.8792" stop-color="#E86823" stop-opacity="0.1208"></stop><stop offset="1" stop-color="#EB672A" stop-opacity="0"></stop></radialGradient><radialGradient id="paint6_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(14.3179 21.4168) rotate(-153.678) scale(5.21989 2.47385)"><stop stop-color="#D86D00"></stop><stop offset="0.3292" stop-color="#DC6C0A" stop-opacity="0.6708"></stop><stop offset="0.8792" stop-color="#E86823" stop-opacity="0.1208"></stop><stop offset="1" stop-color="#EB672A" stop-opacity="0"></stop></radialGradient><radialGradient id="paint7_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.9948 24.1965) rotate(177.226) scale(6.90514 7.07936)"><stop stop-color="#D86D00"></stop><stop offset="0.3292" stop-color="#DC6C0A" stop-opacity="0.6708"></stop><stop offset="0.8792" stop-color="#E86823" stop-opacity="0.1208"></stop><stop offset="1" stop-color="#EB672A" stop-opacity="0"></stop></radialGradient><radialGradient id="paint8_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(14.3253 16.556) rotate(158.456) scale(7.29673 5.51594)"><stop stop-color="#D86D00"></stop><stop offset="0.3292" stop-color="#DC6C0A" stop-opacity="0.6708"></stop><stop offset="0.8792" stop-color="#E86823" stop-opacity="0.1208"></stop><stop offset="1" stop-color="#EB672A" stop-opacity="0"></stop></radialGradient><radialGradient id="paint9_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.2388 9.84634) rotate(158.456) scale(4.39634 3.3234)"><stop stop-color="white"></stop><stop offset="1" stop-color="white" stop-opacity="0"></stop></radialGradient><radialGradient id="paint10_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(5.97178 4.69288) rotate(133.173) scale(6.8756 4.73243)"><stop stop-color="#ED9900"></stop><stop offset="1" stop-color="#ED9900" stop-opacity="0"></stop></radialGradient><radialGradient id="paint11_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12.1073 12.4931) scale(11.3187)"><stop stop-color="#FF8000" stop-opacity="0"></stop><stop offset="0.5434" stop-color="#FD7F00" stop-opacity="0.5434"></stop><stop offset="0.7391" stop-color="#F67C00" stop-opacity="0.7391"></stop><stop offset="0.8781" stop-color="#EB7600" stop-opacity="0.8781"></stop><stop offset="0.9903" stop-color="#DA6E00" stop-opacity="0.9903"></stop><stop offset="1" stop-color="#D86D00"></stop></radialGradient><radialGradient id="paint12_radial${key}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 12.8584) scale(9.78074)"><stop stop-color="#A3541E" stop-opacity="0.5"></stop><stop offset="0.5109" stop-color="#A5551D" stop-opacity="0.7555"></stop><stop offset="0.695" stop-color="#AC5819" stop-opacity="0.8475"></stop><stop offset="0.8261" stop-color="#B75E12" stop-opacity="0.9131"></stop><stop offset="0.9315" stop-color="#C86609" stop-opacity="0.9657"></stop><stop offset="1" stop-color="#D86D00"></stop></radialGradient></defs></g></g></g>`;
var makeAppleShape = (key) => ({
  orig: key,
  customSvg: {
    html: svg(key)
  }
});

// ../learn/src/util.ts
function toLevel(l, it2) {
  if (l.fen.split(" ").length === 4) l.fen += " 0 1";
  return {
    id: it2 + 1,
    apples: [],
    color: fenColor(l.fen),
    detectCapture: l.apples ? false : "unprotected",
    ...l
  };
}
var assetUrl = document.body.dataset.assetUrl + "/assets/";
var isRole = (str) => str.length > 1;
var arrow = (vector, brush) => ({
  brush: brush || "paleGreen",
  orig: vector.slice(0, 2),
  dest: vector.slice(2, 4)
});
var circle = (key, brush) => ({
  brush: brush || "green",
  orig: key
});
var readKeys = (keys) => typeof keys === "string" ? keys.split(" ") : keys;
var pieceImg = (role) => h("div.no-square", h("piece.white." + role));
var roundSvg = (url) => h("div.round-svg", h("img", { attrs: { src: url } }));
var withLinebreaks = (text) => text.split(/(\n)/g).map((part) => part === "\n" ? h("br") : part);
var decomposeUci = (uci) => [uci.slice(0, 2), uci.slice(2, 4), uci.slice(4, 5)];

// ../learn/src/chess.ts
function chess_default(fen, appleKeys) {
  const setup = parseFen(fen).unwrap();
  const chess = Chess.fromSetup(setup);
  const pos = chess.isOk ? chess.unwrap() : Antichess.fromSetup(setup).unwrap();
  if (appleKeys) {
    const color = opposite(pos.turn);
    appleKeys.forEach((key) => {
      pos.board.set(parseSquare(key), { color, role: "pawn" });
    });
  }
  const defaultAntichess = Antichess.default();
  const defaultChess = Chess.default();
  const context = () => {
    const king = pos.board.kingOf(pos.turn);
    const occupied = pos.board.occupied;
    return king ? {
      blockers: occupied,
      checkers: pos.kingAttackers(king, opposite(pos.turn), occupied),
      king,
      mustCapture: false,
      variantEnd: false
    } : defaultAntichess.ctx();
  };
  if (pos instanceof Antichess) {
    pos.ctx = context;
    pos.kingAttackers = defaultChess.kingAttackers;
  }
  const dirtyClone = (pos2, ctx, kingAttackers, dests2) => {
    const clone = pos2.clone();
    clone.ctx = ctx;
    clone.kingAttackers = kingAttackers;
    clone.dests = dests2;
    return clone;
  };
  const cloneWithCtx = (pos2) => dirtyClone(pos2, pos2.ctx, pos2.kingAttackers, pos2.dests);
  const cloneWithChessDests = (pos2) => dirtyClone(pos2, defaultChess.ctx, defaultChess.kingAttackers, defaultChess.dests);
  const cloneWithAntichessDests = (pos2) => dirtyClone(pos2, context, defaultAntichess.kingAttackers, defaultAntichess.dests);
  const history = [];
  const moves = (pos2) => Array.from(dests(pos2)).reduce(
    (prev, [orig, dests2]) => prev.concat(dests2.map((dest) => ({ from: parseSquare(orig), to: parseSquare(dest) }))),
    []
  );
  const findCaptures = (pos2) => moves(pos2).filter((move2) => pos2.board.get(move2.to));
  const setColor = (c) => {
    pos.turn = c;
  };
  const moveToCgMove = (move2) => ({
    orig: makeSquare(move2.from),
    dest: makeSquare(move2.to)
  });
  const kingKey = (color) => {
    const kingSq = pos.board.kingOf(color);
    return kingSq !== void 0 ? makeSquare(kingSq) : void 0;
  };
  const dests = (pos2, opts) => chessgroundDests(
    (opts == null ? void 0 : opts.illegal) || !kingKey(pos2.turn) ? cloneWithAntichessDests(pos2) : cloneWithChessDests(pos2)
  );
  return {
    dests,
    getColor: () => pos.turn,
    setColor,
    fen: () => makeBoardFen(pos.board),
    moves,
    move: (orig, dest, prom) => {
      const move2 = {
        from: parseSquare(orig),
        to: parseSquare(dest),
        promotion: prom ? isRole(prom) ? prom : charToRole(prom) : void 0
      };
      const clone = cloneWithCtx(pos);
      clone.play(move2);
      clone.turn = opposite(clone.turn);
      history.push(makeSan(pos, move2));
      pos.play(move2);
      return !clone.isCheck() ? move2 : null;
    },
    occupiedKeys: () => Array.from(pos.board.occupied).map((s) => makeSquare(s)),
    kingKey,
    findCapture: () => {
      const captures = findCaptures(pos);
      return captures.length ? moveToCgMove(captures[0]) : void 0;
    },
    findUnprotectedCapture: () => {
      const maybeCapture = findCaptures(pos).find((capture2) => {
        const clone = cloneWithCtx(pos);
        clone.play({ from: capture2.from, to: capture2.to });
        return !findCaptures(clone).some((m) => m.to === capture2.to);
      });
      return maybeCapture ? moveToCgMove(maybeCapture) : void 0;
    },
    checks: () => {
      if (!pos.isCheck()) return void 0;
      const color = pos.turn;
      setColor(opposite(color));
      const checks = moves(pos).filter((m) => {
        var _a;
        return ((_a = pos.board.get(m.to)) == null ? void 0 : _a.role) === "king";
      }).map(moveToCgMove);
      setColor(color);
      return checks.length === 0 ? void 0 : checks;
    },
    playRandomMove: () => {
      const all = moves(pos);
      if (all.length) {
        const move2 = all[Math.floor(Math.random() * all.length)];
        pos.play(move2);
        return moveToCgMove(move2);
      }
      return void 0;
    },
    get: (key) => pos.board.get(parseSquare(key)),
    instance: pos,
    sanHistory: () => history,
    defaultChessMate: () => cloneWithChessDests(pos).isCheckmate()
  };
}

// ../learn/src/item.ts
function ctrl(blueprint) {
  const items = new Set(readKeys(blueprint.apples));
  return {
    doIfKeyExists: (key, f) => items.has(key) ? f() : void 0,
    remove: (key) => items.delete(key),
    isEmpty: () => items.size === 0,
    appleKeys: () => Array.from(items)
  };
}

// ../learn/src/promotionCtrl.ts
var PromotionCtrl = class {
  constructor(withGround, redraw) {
    this.withGround = withGround;
    this.redraw = redraw;
    this.promoting = false;
    this.reset = () => {
      this.promoting = false;
    };
    this.start = (orig, dest, callback) => !!this.withGround((ground) => {
      const piece = ground.state.pieces.get(dest);
      if ((piece == null ? void 0 : piece.role) === "pawn" && (dest[1] === "1" && piece.color === "black" || dest[1] === "8" && piece.color === "white")) {
        this.promoting = {
          orig,
          dest,
          callback
        };
        this.redraw();
        return true;
      }
      return false;
    });
    this.finish = (role) => {
      if (this.promoting) {
        this.promote(this.promoting.dest, role);
        this.promoting.callback(this.promoting.orig, this.promoting.dest, role);
      }
      this.promoting = false;
      this.redraw();
    };
    this.promote = (key, role) => this.withGround((ground) => {
      const piece = ground.state.pieces.get(key);
      if ((piece == null ? void 0 : piece.role) === "pawn") {
        const pieces2 = /* @__PURE__ */ new Map([[key, { color: piece.color, role, promoted: true }]]);
        ground.setPieces(pieces2);
      }
    });
  }
};

// ../learn/src/timeouts.ts
var timeouts = [];
function setTimeout2(f, t) {
  timeouts.push(window.setTimeout(f, t));
}
function clearTimeouts() {
  timeouts.forEach((t) => clearTimeout(t));
  timeouts.length = 0;
}

// ../learn/src/scenario.ts
function scenario_default(blueprint, opts) {
  const steps = (blueprint || []).map((step) => typeof step !== "string" ? step : { move: step, shapes: [] });
  let it2 = 0;
  let isFailed = false;
  const fail = () => {
    isFailed = true;
    return false;
  };
  const opponent = () => {
    const step = steps[it2];
    if (!step) return void 0;
    const move2 = decomposeUci(step.move);
    const res = opts.chess.move(move2[0], move2[1], move2[2]);
    if (!res) return fail();
    it2++;
    opts.setFen(opts.chess.fen(), opts.chess.getColor(), opts.makeChessDests(), [move2[0], move2[1]]);
    if (step.shapes) setTimeout2(() => opts.setShapes(step.shapes), 500);
    return void 0;
  };
  return {
    isComplete: () => it2 === steps.length,
    isFailed: () => isFailed,
    opponent,
    player: (move2) => {
      const step = steps[it2];
      if (!step) return false;
      if (step.move !== move2) return fail();
      it2++;
      if (step.shapes) opts.setShapes(step.shapes);
      setTimeout2(opponent, 1e3);
      return true;
    }
  };
}

// ../learn/src/score.ts
var apple = 50;
var capture = 50;
var scenario = 50;
var levelBonus = {
  1: 500,
  2: 300,
  3: 100
};
var getLevelBonus = (l, nbMoves) => {
  const late = nbMoves - l.nbMoves;
  return late <= 0 ? levelBonus[1] : late <= Math.max(1, l.nbMoves / 8) ? levelBonus[2] : levelBonus[3];
};
var getLevelMaxScore = (l) => readKeys(l.apples).length * apple + (l.pointsForCapture ? (l.captures || 0) * capture : 0) + levelBonus[1];
var getLevelRank = (l, score) => {
  const max = getLevelMaxScore(l);
  return score >= max ? 1 : score >= max - 200 ? 2 : 3;
};
var getStageMaxScore = (s) => s.levels.reduce((sum, s2) => sum + getLevelMaxScore(s2), 0);
var getStageRank = (s, score) => {
  const max = getStageMaxScore(s);
  if (typeof score !== "number") score = score.reduce((a2, b) => a2 + b, 0);
  return score >= max ? 1 : score >= max - Math.max(200, s.levels.length * 150) ? 2 : 3;
};
var pieceValues = {
  queen: 90,
  rook: 50,
  bishop: 30,
  knight: 30,
  pawn: 10
};
var pieceValue = (p2) => pieceValues[p2];
var gtz = (s) => s > 0;

// ../learn/src/sound.ts
var make = (name, volume) => {
  site.sound.load(name, site.sound.url(`${name}.mp3`));
  return () => site.sound.play(name, volume);
};
var move = () => site.sound.play("move");
var take = make("sfx/Tournament3rd", 0.4);
var levelStart = make("other/ping");
var levelEnd = make("other/energy3");
var stageStart = make("other/guitar");
var stageEnd = make("other/gewonnen");
var failure = make("other/no-go");

// ../learn/src/levelCtrl.ts
var LevelCtrl = class {
  constructor(withGround, blueprint, opts, redraw) {
    this.withGround = withGround;
    this.blueprint = blueprint;
    this.opts = opts;
    this.redraw = redraw;
    this.vm = {
      lastStep: false,
      completed: false,
      willComplete: false,
      failed: false,
      score: 0,
      nbMoves: 0
    };
    this.makeChessDests = () => this.chess.dests(this.chess.instance, { illegal: this.blueprint.offerIllegalMove });
    this.initializeWithGround = (ground) => {
      const { chess, blueprint } = this;
      const sendMove = this.makeSendMove(ground);
      ground.set({
        fen: chess.fen(),
        lastMove: void 0,
        selected: void 0,
        orientation: blueprint.color,
        coordinates: true,
        turnColor: chess.getColor(),
        check: chess.instance.isCheck(),
        autoCastle: blueprint.autoCastle,
        movable: {
          free: false,
          color: chess.getColor(),
          dests: this.makeChessDests(),
          rookCastle: false
        },
        events: {
          move: (orig, dest) => {
            const piece = ground.state.pieces.get(dest);
            if (!piece || piece.color !== blueprint.color) return;
            if (!this.promotionCtrl.start(orig, dest, sendMove)) sendMove(orig, dest);
          }
        },
        premovable: { enabled: true },
        drawable: { enabled: true, eraseOnMovablePieceClick: true },
        highlight: { lastMove: true },
        animation: {
          enabled: false,
          // prevent piece animation during transition
          duration: 200
        },
        disableContextMenu: true
      });
      setTimeout(() => ground.set({ animation: { enabled: true } }), 200);
      this.setShapes(blueprint.shapes);
    };
    this.makeSendMove = (ground) => {
      const { items, scenario: scenario2, chess, blueprint, vm, redraw } = this;
      const assertData = () => ({ scenario: scenario2, chess, vm });
      const detectFailure = () => {
        var _a;
        const failed = !!((_a = blueprint.failure) == null ? void 0 : _a.call(blueprint, assertData()));
        if (failed) failure();
        return failed;
      };
      const detectSuccess = () => blueprint.success ? blueprint.success(assertData()) : items.isEmpty();
      const detectCapture = () => {
        if (!blueprint.detectCapture) return false;
        const move2 = blueprint.detectCapture === "unprotected" ? chess.findUnprotectedCapture() : chess.findCapture();
        if (!move2) return false;
        vm.failed = true;
        ground.stop();
        this.showCapture(move2);
        failure();
        return true;
      };
      const enemyRoleToBeCaptured = (orig, dest) => {
        var _a;
        const destSquare = parseSquare(dest);
        const pieceBeingMoved = chess.instance.board.get(parseSquare(orig));
        const enPassant = destSquare === chess.instance.epSquare && (pieceBeingMoved == null ? void 0 : pieceBeingMoved.role) === "pawn";
        return enPassant ? "pawn" : (_a = chess.instance.board.get(destSquare)) == null ? void 0 : _a.role;
      };
      return (orig, dest, prom) => {
        vm.nbMoves++;
        const enemyRoleCaptured = enemyRoleToBeCaptured(orig, dest);
        const move2 = chess.move(orig, dest, prom);
        if (move2) this.setFen(chess.fen(), blueprint.color, /* @__PURE__ */ new Map());
        else {
          vm.failed = true;
          this.showKingAttackers();
          failure();
          redraw();
          return;
        }
        let took = false, inScenario, captured = false;
        items.doIfKeyExists(makeSquare(move2.to), () => {
          vm.score += apple;
          items.remove(makeSquare(move2.to));
          took = true;
        });
        if (!took && enemyRoleCaptured && blueprint.pointsForCapture && enemyRoleCaptured !== "king") {
          vm.score += blueprint.showPieceValues ? pieceValue(enemyRoleCaptured) : capture;
          took = true;
        }
        this.setCheck();
        if (scenario2.player(makeUci(move2))) {
          vm.score += scenario;
          inScenario = true;
        } else {
          captured = detectCapture();
          vm.failed = vm.failed || captured || detectFailure();
        }
        if (this.isAppleLevel()) this.setShapes();
        if (!vm.failed && detectSuccess()) this.complete();
        if (vm.willComplete) return;
        if (!vm.failed && took || inScenario) take();
        else move();
        if (vm.failed) {
          if (blueprint.showFailureFollowUp && !captured)
            setTimeout2(() => {
              const rm = chess.playRandomMove();
              if (!rm) return;
              this.setFen(chess.fen(), blueprint.color, /* @__PURE__ */ new Map(), [rm.orig, rm.dest]);
            }, 600);
        } else {
          ground.selectSquare(dest);
          if (!inScenario) {
            if (blueprint.color !== chess.getColor()) chess.instance.epSquare = void 0;
            chess.setColor(blueprint.color);
            this.setColorDests(blueprint.color, this.makeChessDests());
          }
        }
        redraw();
      };
    };
    this.setFen = (fen, color, dests, lastMove) => this.withGround(
      (g) => g.set({
        turnColor: color,
        fen,
        movable: { color, dests },
        lastMove
      })
    );
    this.setShapes = (shapes = []) => this.withGround((ground) => {
      const appleShapes = this.items.appleKeys().map(makeAppleShape);
      ground.setAutoShapes(appleShapes);
      ground.setShapes(shapes);
    });
    this.showCapture = ({ orig, dest }) => this.withGround((ground) => {
      this.setShapes([{ orig, label: { text: "!", fill: "#af0000" } }]);
      setTimeout2(() => {
        this.setShapes([]);
        ground.move(orig, dest);
      }, 600);
    });
    this.showKingAttackers = () => this.withGround((ground) => {
      const turn = this.chess.getColor();
      const kingKey = this.chess.kingKey(opposite(turn));
      const shapes = this.chess.moves(this.chess.instance).filter((m) => makeSquare(m.to) === kingKey).map((m) => arrow(makeUci(m), "red"));
      ground.set({ check: turn });
      this.setShapes(shapes);
    });
    this.setCheck = () => this.withGround((ground) => {
      const checks = this.chess.checks();
      const turn = this.chess.instance.turn;
      ground.set({ check: !!checks && turn });
      if (checks) this.setShapes(checks.map((move2) => arrow(move2.orig + move2.dest, "yellow")));
    });
    this.setColorDests = (color, dests) => this.withGround(
      (ground) => ground.set({
        turnColor: color,
        movable: { color, dests }
      })
    );
    this.start = () => {
      levelStart();
      if (this.chess.getColor() !== this.blueprint.color) setTimeout2(this.scenario.opponent, 1e3);
    };
    this.complete = () => {
      this.vm.willComplete = true;
      this.vm.score += getLevelBonus(this.blueprint, this.vm.nbMoves);
      this.opts.onCompleteImmediate();
      this.withGround(
        (g) => setTimeout2(
          () => {
            this.vm.lastStep = false;
            this.vm.completed = true;
            levelEnd();
            this.withGround((g2) => g2.stop());
            this.redraw();
            if (!this.blueprint.nextButton) setTimeout2(this.opts.onComplete, 1200);
          },
          g.state.stats.dragged ? 1 : 250
        )
      );
    };
    this.onComplete = () => this.opts.onComplete();
    var _a;
    clearTimeouts();
    this.isAppleLevel = prop(((_a = blueprint.apples) == null ? void 0 : _a.length) > 0);
    this.items = ctrl({ apples: blueprint.apples });
    this.chess = chess_default(blueprint.fen, blueprint.emptyApples ? [] : this.items.appleKeys());
    this.scenario = scenario_default(blueprint.scenario, {
      setFen: this.setFen,
      setShapes: this.setShapes,
      chess: this.chess,
      makeChessDests: this.makeChessDests
    });
    this.promotionCtrl = new PromotionCtrl(withGround, redraw);
    withGround(this.initializeWithGround);
  }
};

// ../learn/src/stage/bishop.ts
var stage = {
  key: "bishop",
  title: i18n.learn.theBishop,
  subtitle: i18n.learn.itMovesDiagonally,
  image: assetUrl + "images/learn/pieces/B.svg",
  intro: i18n.learn.bishopIntro,
  illustration: pieceImg("bishop"),
  levels: [
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/8/5B2/8/8 w - -",
      apples: "d5 g8",
      nbMoves: 2,
      shapes: [arrow("f3d5"), arrow("d5g8")]
    },
    {
      goal: i18n.learn.theFewerMoves,
      fen: "8/8/8/8/8/1B6/8/8 w - -",
      apples: "a2 b1 b5 d1 d3 e2",
      nbMoves: 6
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/3B4/8/8/8 w - -",
      apples: "a1 b6 c1 e3 g7 h6",
      nbMoves: 6
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/2B5/8/8/8 w - -",
      apples: "a4 b1 b3 c2 d3 e2",
      nbMoves: 6
    },
    {
      goal: i18n.learn.youNeedBothBishops,
      fen: "8/8/8/8/8/8/8/2B2B2 w - -",
      apples: "d3 d4 d5 e3 e4 e5",
      nbMoves: 6
    },
    {
      goal: i18n.learn.youNeedBothBishops,
      fen: "8/3B4/8/8/8/2B5/8/8 w - -",
      apples: "a3 c2 e7 f5 f6 g8 h4 h7",
      nbMoves: 11
    }
  ].map(toLevel),
  complete: i18n.learn.bishopComplete
};
var bishop_default = stage;

// ../learn/src/assert.ts
var pieceMatch = (piece, matcher) => (piece == null ? void 0 : piece.role) === matcher.role && piece.color === matcher.color;
var pieceOnAnyOf = (matcher, keys) => (level) => keys.some((key) => pieceMatch(level.chess.get(key), matcher));
var fenToMatcher = (fenPiece) => ({
  role: charToRole(fenPiece),
  color: fenPiece.toLowerCase() === fenPiece ? "black" : "white"
});
var pieceOn = (fenPiece, key) => (level) => pieceMatch(level.chess.get(key), fenToMatcher(fenPiece));
var pieceNotOn = (fenPiece, key) => (level) => !pieceMatch(level.chess.get(key), fenToMatcher(fenPiece));
var noPieceOn = (keys) => {
  const keyArr = readKeys(keys);
  return (level) => level.chess.occupiedKeys().some((sq) => !keyArr.includes(sq));
};
var whitePawnOnAnyOf = (keys) => pieceOnAnyOf(fenToMatcher("P"), readKeys(keys));
var extinct = (color) => (level) => {
  const fen = level.chess.fen().split(" ")[0].replace(/\//g, "");
  return fen === (color === "white" ? fen.toLowerCase() : fen.toUpperCase());
};
var check = (level) => level.chess.instance.isCheck();
var mate = (level) => level.chess.defaultChessMate();
var lastMoveSan = (san) => (level) => {
  const moves = level.chess.sanHistory();
  return moves[moves.length - 1] === san;
};
function checkIn(nbMoves) {
  return (level) => level.vm.nbMoves <= nbMoves && level.chess.instance.isCheck();
}
function noCheckIn(nbMoves) {
  return (level) => level.vm.nbMoves >= nbMoves && !level.chess.instance.isCheck();
}
function not(assert) {
  return (level) => !assert(level);
}
var and = (...asserts) => (level) => asserts.every((a2) => a2(level));
function or(...asserts) {
  return (level) => asserts.some((a2) => a2(level));
}
var scenarioComplete = (level) => level.scenario.isComplete();
var scenarioFailed = (level) => level.scenario.isFailed();

// ../learn/src/stage/capture.ts
var imgUrl = assetUrl + "images/learn/bowman.svg";
var stage2 = {
  key: "capture",
  title: i18n.learn.capture,
  subtitle: i18n.learn.takeTheEnemyPieces,
  image: imgUrl,
  intro: i18n.learn.captureIntro,
  illustration: roundSvg(imgUrl),
  levels: [
    {
      // rook
      goal: i18n.learn.takeTheBlackPieces,
      fen: "8/2p2p2/8/8/8/2R5/8/8 w - -",
      nbMoves: 2,
      captures: 2,
      shapes: [arrow("c3c7"), arrow("c7f7")]
    },
    {
      // queen
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "8/2r2p2/8/8/5Q2/8/8/8 w - -",
      nbMoves: 2,
      captures: 2,
      shapes: [arrow("f4c7"), arrow("f4f7", "red"), arrow("c7f7", "yellow")]
    },
    {
      // bishop
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "8/5r2/8/1r3p2/8/3B4/8/8 w - -",
      nbMoves: 5,
      captures: 3
    },
    {
      // queen
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "8/5b2/5p2/3n2p1/8/6Q1/8/8 w - -",
      nbMoves: 7,
      captures: 4
    },
    {
      // knight
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "8/3b4/2p2q2/8/3p1N2/8/8/8 w - -",
      nbMoves: 6,
      captures: 4
    }
  ].map((l, i) => toLevel({ ...l, pointsForCapture: true, success: extinct("black") }, i)),
  complete: i18n.learn.captureComplete
};
var capture_default = stage2;

// ../learn/src/stage/castling.ts
var imgUrl2 = assetUrl + "images/learn/castle.svg";
var castledKingSide = lastMoveSan("O-O");
var castledQueenSide = lastMoveSan("O-O-O");
var cantCastleKingSide = and(
  not(castledKingSide),
  or(pieceNotOn("K", "e1"), pieceNotOn("R", "h1"), mate, pieceNotOn("k", "e8"))
);
var cantCastleQueenSide = and(
  not(castledQueenSide),
  or(pieceNotOn("K", "e1"), pieceNotOn("R", "a1"), mate, pieceNotOn("k", "e8"))
);
var cantCastleKingSide8 = and(
  not(castledKingSide),
  or(pieceNotOn("K", "e1"), pieceNotOn("R", "h1"), mate, pieceNotOn("k", "g8"))
);
var cantCastleQueenSide9 = and(
  not(castledQueenSide),
  or(pieceNotOn("K", "e1"), pieceNotOn("R", "a1"), mate, pieceNotOn("k", "d8"))
);
var stage3 = {
  key: "castling",
  title: i18n.learn.castling,
  subtitle: i18n.learn.theSpecialKingMove,
  image: imgUrl2,
  intro: i18n.learn.castlingIntro,
  illustration: roundSvg(imgUrl2),
  levels: [
    {
      goal: i18n.learn.castleKingSide,
      fen: "rnbqkbnr/pppppppp/8/8/2B5/4PN2/PPPP1PPP/RNBQK2R w KQkq -",
      nbMoves: 1,
      shapes: [arrow("e1g1")],
      success: castledKingSide,
      failure: cantCastleKingSide
    },
    {
      goal: i18n.learn.castleQueenSide,
      fen: "rnbqkbnr/pppppppp/8/8/4P3/1PN5/PBPPQPPP/R3KBNR w KQkq -",
      nbMoves: 1,
      shapes: [arrow("e1c1")],
      success: castledQueenSide,
      failure: cantCastleQueenSide
    },
    {
      goal: i18n.learn.theKnightIsInTheWay,
      fen: "rnbqkbnr/pppppppp/8/8/8/4P3/PPPPBPPP/RNBQK1NR w KQkq -",
      nbMoves: 2,
      shapes: [arrow("e1g1"), arrow("g1f3")],
      success: castledKingSide,
      failure: cantCastleKingSide
    },
    {
      goal: i18n.learn.castleKingSideMovePiecesFirst,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
      nbMoves: 4,
      shapes: [arrow("e1g1")],
      success: castledKingSide,
      failure: cantCastleKingSide
    },
    {
      goal: i18n.learn.castleQueenSideMovePiecesFirst,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
      nbMoves: 6,
      shapes: [arrow("e1c1")],
      success: castledQueenSide,
      failure: cantCastleQueenSide
    },
    {
      goal: i18n.learn.youCannotCastleIfMoved,
      fen: "rnbqkbnr/pppppppp/8/8/3P4/1PN1PN2/PBPQBPPP/R3K1R1 w Qkq -",
      nbMoves: 1,
      shapes: [arrow("e1g1", "red"), arrow("e1c1")],
      success: castledQueenSide,
      failure: cantCastleQueenSide
    },
    {
      goal: i18n.learn.youCannotCastleIfAttacked,
      fen: "rn1qkbnr/ppp1pppp/3p4/8/2b5/4PN2/PPPP1PPP/RNBQK2R w KQkq -",
      nbMoves: 2,
      shapes: [arrow("c4f1", "red"), circle("e1"), circle("f1"), circle("g1")],
      success: castledKingSide,
      failure: cantCastleKingSide,
      detectCapture: false
    },
    {
      goal: i18n.learn.findAWayToCastleKingSide,
      fen: "rnb2rk1/pppppppp/8/8/8/4Nb1n/PPPP1P1P/RNB1KB1R w KQkq -",
      nbMoves: 2,
      shapes: [arrow("e1g1")],
      success: castledKingSide,
      failure: cantCastleKingSide8,
      detectCapture: false
    },
    {
      goal: i18n.learn.findAWayToCastleQueenSide,
      fen: "1r1k2nr/p2ppppp/7b/7b/4P3/2nP4/P1P2P2/RN2K3 w Q -",
      nbMoves: 4,
      shapes: [arrow("e1c1")],
      success: castledQueenSide,
      failure: cantCastleQueenSide9,
      detectCapture: false
    }
  ].map((l, i) => toLevel({ ...l, autoCastle: true }, i)),
  complete: i18n.learn.castlingComplete
};
var castling_default = stage3;

// ../learn/src/stage/check1.ts
var imgUrl3 = assetUrl + "images/learn/winged-sword.svg";
var common = {
  nbMoves: 1,
  failure: not(check),
  success: check
};
var stage4 = {
  key: "check1",
  title: i18n.learn.checkInOne,
  subtitle: i18n.learn.attackTheOpponentsKing,
  image: imgUrl3,
  intro: i18n.learn.checkInOneIntro,
  illustration: roundSvg(imgUrl3),
  levels: [
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "4k3/8/2b5/8/8/8/8/R7 w - -",
      shapes: [arrow("a1e1")]
    },
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "8/8/4k3/3n4/8/1Q6/8/8 w - -"
    },
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "3qk3/1pp5/3p4/4p3/8/3B4/6r1/8 w - -"
    },
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "2r2q2/2n5/8/4k3/8/2N1P3/3P2B1/8 w - -"
    },
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "8/2b1q2n/1ppk4/2N5/8/8/8/8 w - -"
    },
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "6R1/1k3r2/8/4Q3/8/2n5/8/8 w - -"
    },
    {
      goal: i18n.learn.checkInOneGoal,
      fen: "7r/4k3/8/3n4/4N3/8/2R5/4Q3 w - -"
    }
  ].map((l, i) => toLevel({ ...common, ...l }, i)),
  complete: i18n.learn.checkInOneComplete
};
var check1_default = stage4;

// ../learn/src/stage/check2.ts
var imgUrl4 = assetUrl + "images/learn/crossed-swords.svg";
var common2 = () => ({
  nbMoves: 2,
  failure: noCheckIn(2),
  success: checkIn(2)
});
var stage5 = {
  key: "check2",
  title: i18n.learn.checkInTwo,
  subtitle: i18n.learn.twoMovesToGiveCheck,
  image: imgUrl4,
  intro: i18n.learn.checkInTwoIntro,
  illustration: roundSvg(imgUrl4),
  levels: [
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "2k5/2pb4/8/2R5/8/8/8/8 w - -",
      shapes: [arrow("c5a5"), arrow("a5a8")]
    },
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "8/8/5k2/8/8/1N6/5b2/8 w - -"
    },
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "6k1/2r3pp/8/1N6/8/8/4B3/8 w - -"
    },
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "r3k3/7b/8/4B3/8/8/4N3/4R3 w - -"
    },
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "r1bqkb1r/pppp1p1p/2n2np1/4p3/2B5/4PN2/PPPP1PPP/RNBQK2R w KQkq -"
    },
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "8/8/8/2k5/q7/4N3/3B4/8 w - -"
    },
    {
      goal: i18n.learn.checkInTwoGoal,
      fen: "r6r/1Q2nk2/1B3p2/8/8/8/8/8 w - -"
    }
  ].map((l, i) => toLevel({ ...common2(), ...l }, i)),
  complete: i18n.learn.checkInTwoComplete
};
var check2_default = stage5;

// ../learn/src/stage/checkmate1.ts
var imgUrl5 = assetUrl + "images/learn/guillotine.svg";
var common3 = {
  nbMoves: 1,
  failure: not(mate),
  success: mate,
  showFailureFollowUp: true
};
var stage6 = {
  key: "checkmate1",
  title: i18n.learn.mateInOne,
  subtitle: i18n.learn.defeatTheOpponentsKing,
  image: imgUrl5,
  intro: i18n.learn.mateInOneIntro,
  illustration: roundSvg(imgUrl5),
  levels: [
    {
      // rook
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "3qk3/3ppp2/8/8/2B5/5Q2/8/8 w - -",
      shapes: [arrow("f3f7")]
    },
    {
      // smothered
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "6rk/6pp/7P/6N1/8/8/8/8 w - -"
    },
    {
      // rook
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "R7/8/7k/2r5/5n2/8/6Q1/8 w - -"
    },
    {
      // Q+N
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "2rb4/2k5/5N2/1Q6/8/8/8/8 w - -"
    },
    {
      // discovered
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "1r2kb2/ppB1p3/2P2p2/2p1N3/B7/8/8/3R4 w - -"
    },
    {
      // tricky
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "8/pk1N4/n7/b7/6B1/1r3b2/8/1RR5 w - -",
      scenario: [
        {
          move: "g4f3",
          shapes: [arrow("b1b7", "yellow"), arrow("f3b7", "yellow")]
        }
      ]
    },
    {
      // tricky
      goal: i18n.learn.attackYourOpponentsKing,
      fen: "r1b5/ppp5/2N2kpN/5q2/8/Q7/8/4B3 w - -"
    }
  ].map((l, i) => toLevel({ ...common3, ...l }, i)),
  complete: i18n.learn.mateInOneComplete
};
var checkmate1_default = stage6;

// ../learn/src/stage/combat.ts
var imgUrl6 = assetUrl + "images/learn/battle-gear.svg";
var stage7 = {
  key: "combat",
  title: i18n.learn.combat,
  subtitle: i18n.learn.captureAndDefendPieces,
  image: imgUrl6,
  intro: i18n.learn.combatIntro,
  illustration: roundSvg(imgUrl6),
  levels: [
    {
      // rook
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "8/8/8/8/P2r4/6B1/8/8 w - -",
      nbMoves: 3,
      captures: 1,
      shapes: [arrow("a4a5"), arrow("g3f2"), arrow("f2d4"), arrow("d4a4", "yellow")]
    },
    {
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "2r5/8/3b4/2P5/8/1P6/2B5/8 w - -",
      nbMoves: 4,
      captures: 2
    },
    {
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "1r6/8/5n2/3P4/4P1P1/1Q6/8/8 w - -",
      nbMoves: 4,
      captures: 2
    },
    {
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "2r5/8/3N4/5b2/8/8/PPP5/8 w - -",
      nbMoves: 4,
      captures: 2
    },
    {
      goal: i18n.learn.takeTheBlackPiecesAndDontLoseYours,
      fen: "8/6q1/8/4P1P1/8/4B3/r2P2N1/8 w - -",
      nbMoves: 8,
      captures: 2
    }
  ].map((l, i) => toLevel({ ...l, pointsForCapture: true, success: extinct("black") }, i)),
  complete: i18n.learn.combatComplete
};
var combat_default = stage7;

// ../learn/src/stage/enpassant.ts
var imgUrl7 = assetUrl + "images/learn/spinning-blades.svg";
var stage8 = {
  key: "enpassant",
  title: i18n.site.enPassant,
  subtitle: i18n.learn.theSpecialPawnMove,
  image: imgUrl7,
  intro: i18n.learn.enPassantIntro,
  illustration: roundSvg(imgUrl7),
  levels: [
    {
      goal: i18n.learn.blackJustMovedThePawnByTwoSquares,
      fen: "rnbqkbnr/pppppppp/8/2P5/8/8/PP1PPPPP/RNBQKBNR b KQkq -",
      color: "white",
      nbMoves: 1,
      success: scenarioComplete,
      failure: scenarioFailed,
      detectCapture: false,
      scenario: [
        {
          move: "d7d5",
          shapes: [arrow("c5d6")]
        },
        "c5d6"
      ],
      captures: 1
    },
    {
      goal: i18n.learn.enPassantOnlyWorksImmediately,
      fen: "rnbqkbnr/ppp1pppp/8/2Pp3P/8/8/PP1PPPP1/RNBQKBNR b KQkq -",
      color: "white",
      nbMoves: 1,
      success: scenarioComplete,
      failure: scenarioFailed,
      detectCapture: false,
      scenario: [
        {
          move: "g7g5",
          shapes: [arrow("h5g6"), arrow("c5d6", "red")]
        },
        "h5g6"
      ],
      captures: 1
    },
    {
      goal: i18n.learn.enPassantOnlyWorksOnFifthRank,
      fen: "rnbqkbnr/pppppppp/P7/2P5/8/8/PP1PPPP1/RNBQKBNR b KQkq -",
      color: "white",
      nbMoves: 1,
      success: scenarioComplete,
      failure: scenarioFailed,
      detectCapture: false,
      scenario: [
        {
          move: "b7b5",
          shapes: [arrow("c5b6"), arrow("a6b7", "red")]
        },
        "c5b6"
      ],
      captures: 1,
      cssClass: "highlight-5th-rank"
    },
    {
      goal: i18n.learn.takeAllThePawnsEnPassant,
      fen: "rnbqkbnr/pppppppp/8/2PPP2P/8/8/PP1P1PP1/RNBQKBNR b KQkq -",
      color: "white",
      nbMoves: 4,
      detectCapture: false,
      success: scenarioComplete,
      failure: scenarioFailed,
      scenario: ["b7b5", "c5b6", "f7f5", "e5f6", "c7c5", "d5c6", "g7g5", "h5g6"],
      captures: 4
    }
  ].map(toLevel),
  complete: i18n.learn.enPassantComplete
};
var enpassant_default = stage8;

// ../learn/src/stage/king.ts
var stage9 = {
  key: "king",
  title: i18n.learn.theKing,
  subtitle: i18n.learn.theMostImportantPiece,
  image: assetUrl + "images/learn/pieces/K.svg",
  intro: i18n.learn.kingIntro,
  illustration: pieceImg("king"),
  levels: [
    {
      goal: i18n.learn.theKingIsSlow,
      fen: "8/8/8/8/8/3K4/8/8 w - -",
      apples: "e6",
      nbMoves: 3,
      shapes: [arrow("d3d4"), arrow("d4d5"), arrow("d5e6")]
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/8/8/8/4K3 w - -",
      apples: "c2 d3 e2 e3",
      nbMoves: 4
    },
    {
      goal: i18n.learn.lastOne,
      fen: "8/8/8/4K3/8/8/8/8 w - -",
      apples: "b5 c5 d6 e3 f3 g4",
      nbMoves: 8
    }
  ].map((l, i) => toLevel({ ...l, emptyApples: true }, i)),
  complete: i18n.learn.kingComplete
};
var king_default = stage9;

// ../learn/src/stage/knight.ts
var stage10 = {
  key: "knight",
  title: i18n.learn.theKnight,
  subtitle: i18n.learn.itMovesInAnLShape,
  image: assetUrl + "images/learn/pieces/N.svg",
  intro: i18n.learn.knightIntro,
  illustration: pieceImg("knight"),
  levels: [
    {
      goal: i18n.learn.knightsHaveAFancyWay,
      fen: "8/8/8/8/4N3/8/8/8 w - -",
      apples: "c5 d7",
      nbMoves: 2,
      shapes: [arrow("e4c5"), arrow("c5d7")]
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/8/8/8/1N6 w - -",
      apples: "c3 d4 e2 f3 f7 g5 h8",
      nbMoves: 8
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/2N5/8/8/8/8/8/8 w - -",
      apples: "b6 d5 d7 e6 f4",
      nbMoves: 5
    },
    {
      goal: i18n.learn.knightsCanJumpOverObstacles,
      fen: "8/8/8/8/5N2/8/8/8 w - -",
      apples: "e3 e4 e5 f3 f5 g3 g4 g5",
      nbMoves: 9
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/8/3N4/8/8 w - -",
      apples: "c3 e2 e4 f2 f4 g6",
      nbMoves: 6
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/2N5/8/8/8/8/8/8 w - -",
      apples: "b4 b5 c6 c8 d4 d5 e3 e7 f5",
      nbMoves: 9
    }
  ].map(toLevel),
  complete: i18n.learn.knightComplete
};
var knight_default = stage10;

// ../learn/src/stage/outOfCheck.ts
var imgUrl8 = assetUrl + "images/learn/guards.svg";
var common4 = {
  detectCapture: false,
  offerIllegalMove: true,
  nbMoves: 1
};
var stage11 = {
  key: "outOfCheck",
  title: i18n.learn.outOfCheck,
  subtitle: i18n.learn.defendYourKing,
  image: imgUrl8,
  intro: i18n.learn.outOfCheckIntro,
  illustration: roundSvg(imgUrl8),
  levels: [
    {
      goal: i18n.learn.escapeWithTheKing,
      fen: "8/8/8/4q3/8/8/8/4K3 w - -",
      shapes: [arrow("e5e1", "red"), arrow("e1f1")]
    },
    {
      goal: i18n.learn.escapeWithTheKing,
      fen: "8/2n5/5b2/8/2K5/8/2q5/8 w - -"
    },
    {
      goal: i18n.learn.theKingCannotEscapeButBlock,
      fen: "8/7r/6r1/8/R7/7K/8/8 w - -"
    },
    {
      goal: i18n.learn.youCanGetOutOfCheckByTaking,
      fen: "8/8/8/3b4/8/4N3/KBn5/1R6 w - -"
    },
    {
      goal: i18n.learn.thisKnightIsCheckingThroughYourDefenses,
      fen: "4q3/8/8/8/8/5nb1/3PPP2/3QKBNr w - -"
    },
    {
      goal: i18n.learn.escapeOrBlock,
      fen: "8/8/7p/2q5/5n2/1N1KP2r/3R4/8 w - -"
    },
    {
      goal: i18n.learn.escapeOrBlock,
      fen: "8/6b1/8/8/q4P2/2KN4/3P4/8 w - -"
    }
  ].map((l, i) => toLevel({ ...common4, ...l }, i)),
  complete: i18n.learn.outOfCheckComplete
};
var outOfCheck_default = stage11;

// ../learn/src/stage/pawn.ts
var stage12 = {
  key: "pawn",
  title: i18n.learn.thePawn,
  subtitle: i18n.learn.itMovesForwardOnly,
  image: assetUrl + "images/learn/pieces/P.svg",
  intro: i18n.learn.pawnIntro,
  illustration: pieceImg("pawn"),
  levels: [
    {
      goal: i18n.learn.pawnsMoveOneSquareOnly,
      fen: "8/8/8/P7/8/8/8/8 w - -",
      apples: "f3",
      nbMoves: 4,
      shapes: [arrow("a5a6"), arrow("a6a7"), arrow("a7a8"), arrow("a8f3")],
      explainPromotion: true
    },
    {
      goal: i18n.learn.mostOfTheTimePromotingToAQueenIsBest,
      fen: "8/8/8/5P2/8/8/8/8 w - -",
      apples: "b6 c4 d7 e5 a8",
      nbMoves: 8
    },
    {
      goal: i18n.learn.pawnsMoveForward,
      fen: "8/8/8/8/8/4P3/8/8 w - -",
      apples: "c6 d5 d7",
      nbMoves: 4,
      shapes: [arrow("e3e4"), arrow("e4d5"), arrow("d5c6"), arrow("c6d7")],
      failure: noPieceOn("e3 e4 c6 d5 d7")
    },
    {
      goal: i18n.learn.captureThenPromote,
      fen: "8/8/8/8/8/1P6/8/8 w - -",
      apples: "b4 b6 c4 c6 c7 d6",
      nbMoves: 8
    },
    {
      goal: i18n.learn.captureThenPromote,
      fen: "8/8/8/8/8/3P4/8/8 w - -",
      apples: "c4 b5 b6 d5 d7 e6 c8",
      failure: whitePawnOnAnyOf("b5 d4 d6 c7"),
      nbMoves: 8
    },
    {
      goal: i18n.learn.useAllThePawns,
      fen: "8/8/8/8/8/P1PP3P/8/8 w - -",
      apples: "b5 c5 d4 e5 g4",
      nbMoves: 7
    },
    {
      goal: i18n.learn.aPawnOnTheSecondRank,
      fen: "8/8/8/8/8/8/4P3/8 w - -",
      apples: "d6",
      nbMoves: 3,
      shapes: [arrow("e2e4")],
      failure: whitePawnOnAnyOf("e3"),
      cssClass: "highlight-2nd-rank"
    },
    {
      goal: i18n.learn.grabAllTheStarsNoNeedToPromote,
      fen: "8/8/8/8/8/8/2PPPP2/8 w - -",
      apples: "c5 d5 e5 f5 d3 e4",
      nbMoves: 9
    }
  ].map(toLevel),
  complete: i18n.learn.pawnComplete
};
var pawn_default = stage12;

// ../learn/src/stage/protection.ts
var imgUrl9 = assetUrl + "images/learn/bolt-shield.svg";
var stage13 = {
  key: "protection",
  title: i18n.learn.protection,
  subtitle: i18n.learn.keepYourPiecesSafe,
  image: imgUrl9,
  intro: i18n.learn.protectionIntro,
  illustration: roundSvg(imgUrl9),
  levels: [
    {
      goal: i18n.learn.escape,
      fen: "8/8/8/4bb2/8/8/P2P4/R2K4 w - -",
      shapes: [arrow("e5a1", "red"), arrow("a1c1")]
    },
    {
      // escape
      goal: i18n.learn.escape,
      fen: "8/8/2q2N2/8/8/8/8/8 w - -"
    },
    {
      // protect
      goal: i18n.learn.noEscape,
      fen: "8/N2q4/8/8/8/8/6R1/8 w - -",
      scenario: [
        {
          move: "g2a2",
          shapes: [arrow("a2a7", "green")]
        }
      ]
    },
    {
      goal: i18n.learn.noEscape,
      fen: "8/8/1Bq5/8/2P5/8/8/8 w - -"
    },
    {
      goal: i18n.learn.noEscape,
      fen: "1r6/8/5b2/8/8/5N2/P2P4/R1B5 w - -",
      shapes: [arrow("f6a1", "red"), arrow("d2d4")]
    },
    {
      goal: i18n.learn.dontLetThemTakeAnyUndefendedPiece,
      fen: "8/1b6/8/8/8/3P2P1/5NRP/r7 w - -"
    },
    {
      goal: i18n.learn.dontLetThemTakeAnyUndefendedPiece,
      fen: "rr6/3q4/4n3/4P1B1/7P/P7/1B1N1PP1/R5K1 w - -"
    },
    {
      goal: i18n.learn.dontLetThemTakeAnyUndefendedPiece,
      fen: "8/3q4/8/1N3R2/8/2PB4/8/8 w - -"
    }
  ].map((l, i) => toLevel({ nbMoves: 1, ...l }, i)),
  complete: i18n.learn.protectionComplete
};
var protection_default = stage13;

// ../learn/src/stage/queen.ts
var stage14 = {
  key: "queen",
  title: i18n.learn.theQueen,
  subtitle: i18n.learn.queenCombinesRookAndBishop,
  image: assetUrl + "images/learn/pieces/Q.svg",
  intro: i18n.learn.queenIntro,
  illustration: pieceImg("queen"),
  levels: [
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/8/8/4Q3/8 w - -",
      apples: "e5 b8",
      nbMoves: 2,
      shapes: [arrow("e2e5"), arrow("e5b8")]
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/3Q4/8/8/8 w - -",
      apples: "a3 f2 f8 h3",
      nbMoves: 4
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/2Q5/8/8/8 w - -",
      apples: "a3 d6 f1 f8 g3 h6",
      nbMoves: 6
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/6Q1/8/8/8/8/8/8 w - -",
      apples: "a2 b5 d3 g1 g8 h2 h5",
      nbMoves: 7
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/8/8/8/8/8/8/4Q3 w - -",
      apples: "a6 d1 f2 f6 g6 g8 h1 h4",
      nbMoves: 9
    }
  ].map(toLevel),
  complete: i18n.learn.queenComplete
};
var queen_default = stage14;

// ../learn/src/stage/rook.ts
var stage15 = {
  key: "rook",
  title: i18n.learn.theRook,
  subtitle: i18n.learn.itMovesInStraightLines,
  image: assetUrl + "images/learn/pieces/R.svg",
  intro: i18n.learn.rookIntro,
  illustration: pieceImg("rook"),
  levels: [
    {
      goal: i18n.learn.rookGoal,
      fen: "8/8/8/8/8/8/4R3/8 w - -",
      apples: "e7",
      nbMoves: 1,
      shapes: [arrow("e2e7")]
    },
    {
      goal: i18n.learn.grabAllTheStars,
      fen: "8/2R5/8/8/8/8/8/8 w - -",
      apples: "c5 g5",
      nbMoves: 2,
      shapes: [arrow("c7c5"), arrow("c5g5")]
    },
    {
      goal: i18n.learn.theFewerMoves,
      fen: "8/8/8/8/3R4/8/8/8 w - -",
      apples: "a4 g3 g4",
      nbMoves: 3
    },
    {
      goal: i18n.learn.theFewerMoves,
      fen: "7R/8/8/8/8/8/8/8 w - -",
      apples: "f8 g1 g7 g8 h7",
      nbMoves: 5
    },
    {
      goal: i18n.learn.useTwoRooks,
      fen: "8/1R6/8/8/3R4/8/8/8 w - -",
      apples: "a4 g3 g7 h4",
      nbMoves: 4
    },
    {
      goal: i18n.learn.useTwoRooks,
      fen: "8/8/8/8/8/5R2/8/R7 w - -",
      apples: "b7 d1 d5 f2 f7 g4 g7",
      nbMoves: 7
    }
  ].map(toLevel),
  complete: i18n.learn.rookComplete
};
var rook_default = stage15;

// ../learn/src/stage/setup.ts
var imgUrl10 = assetUrl + "images/learn/rally-the-troops.svg";
var stage16 = {
  key: "setup",
  title: i18n.learn.boardSetup,
  subtitle: i18n.learn.howTheGameStarts,
  image: imgUrl10,
  intro: i18n.learn.boardSetupIntro,
  illustration: roundSvg(imgUrl10),
  levels: [
    {
      // rook
      goal: i18n.learn.thisIsTheInitialPosition,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - -",
      nbMoves: 1
    },
    {
      goal: i18n.learn.firstPlaceTheRooks,
      fen: "r6r/pppppppp/8/8/8/8/8/2RR4 w - -",
      apples: "a1 h1",
      nbMoves: 2,
      shapes: [arrow("c1a1"), arrow("d1h1")],
      success: and(pieceOn("R", "a1"), pieceOn("R", "h1"))
    },
    {
      goal: i18n.learn.thenPlaceTheKnights,
      fen: "rn4nr/pppppppp/8/8/8/8/2NN4/R6R w - -",
      apples: "b1 g1",
      nbMoves: 4,
      success: and(pieceOn("N", "b1"), pieceOn("N", "g1"))
    },
    {
      goal: i18n.learn.placeTheBishops,
      fen: "rnb2bnr/pppppppp/8/8/4BB2/8/8/RN4NR w - -",
      apples: "c1 f1",
      nbMoves: 4,
      success: and(pieceOn("B", "c1"), pieceOn("B", "f1"))
    },
    {
      goal: i18n.learn.placeTheQueen,
      fen: "rnbq1bnr/pppppppp/8/8/5Q2/8/8/RNB2BNR w - -",
      apples: "d1",
      nbMoves: 2,
      success: pieceOn("Q", "d1")
    },
    {
      goal: i18n.learn.placeTheKing,
      fen: "rnbqkbnr/pppppppp/8/8/5K2/8/8/RNBQ1BNR w - -",
      apples: "e1",
      nbMoves: 3,
      success: pieceOn("K", "e1")
    },
    {
      goal: i18n.learn.pawnsFormTheFrontLine,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - -",
      nbMoves: 1,
      cssClass: "highlight-2nd-rank"
    }
  ].map(toLevel),
  complete: i18n.learn.boardSetupComplete,
  cssClass: "no-go-home"
};
var setup_default = stage16;

// ../learn/src/stage/stalemate.ts
var imgUrl11 = assetUrl + "images/learn/scales.svg";
var common5 = {
  goal: i18n.learn.stalemateGoal,
  detectCapture: false,
  nbMoves: 1,
  nextButton: true,
  showFailureFollowUp: true,
  success: scenarioComplete,
  failure: scenarioFailed
};
var stage17 = {
  key: "stalemate",
  title: i18n.learn.stalemate,
  subtitle: i18n.learn.theGameIsADraw,
  image: imgUrl11,
  intro: i18n.learn.stalemateIntro,
  illustration: roundSvg(imgUrl11),
  levels: [
    {
      fen: "k7/8/8/6B1/8/1R6/8/8 w - -",
      shapes: [arrow("g5e3")],
      scenario: [
        {
          move: "g5e3",
          shapes: [
            arrow("e3a7", "blue"),
            arrow("b3b7", "blue"),
            arrow("b3b8", "blue"),
            circle("a7", "blue"),
            circle("b7", "blue"),
            circle("b8", "blue")
          ]
        }
      ]
    },
    {
      fen: "8/7p/4N2k/8/8/3N4/8/1K6 w - -",
      scenario: [
        {
          move: "d3f4",
          shapes: [
            arrow("e6g7", "blue"),
            arrow("e6g5", "blue"),
            arrow("f4g6", "blue"),
            arrow("f4h5", "blue"),
            circle("g7", "blue"),
            circle("g5", "blue"),
            circle("g6", "blue"),
            circle("h5", "blue")
          ]
        }
      ]
    },
    {
      fen: "4k3/6p1/5p2/p4P2/PpB2N2/1K6/8/3R4 w - -",
      scenario: [
        {
          move: "f4g6",
          shapes: [
            arrow("c4f7", "blue"),
            arrow("d1d8", "blue"),
            arrow("g6e7", "blue"),
            arrow("g6f8", "blue")
          ]
        }
      ]
    },
    {
      fen: "8/6pk/6np/7K/8/3B4/8/1R6 w - -",
      scenario: [
        {
          move: "b1b8",
          shapes: [arrow("b8g8", "blue"), arrow("b8h8", "blue"), arrow("d3h7", "red"), arrow("g6e7", "red")]
        }
      ]
    },
    {
      fen: "7R/pk6/p1pP4/K7/3BB2p/7p/1r5P/8 w - -",
      scenario: [
        {
          move: "d4b2",
          shapes: [
            arrow("h8a8", "blue"),
            arrow("a5b6", "blue"),
            arrow("d6c7", "blue"),
            arrow("e4b7", "red"),
            arrow("c6c5", "red")
          ]
        }
      ]
    }
  ].map((l, i) => toLevel({ ...common5, ...l }, i)),
  complete: i18n.learn.stalemateComplete
};
var stalemate_default = stage17;

// ../learn/src/stage/value.ts
var imgUrl12 = assetUrl + "images/learn/sprint.svg";
var common6 = {
  nbMoves: 1,
  captures: 1,
  pointsForCapture: true,
  showPieceValues: true
};
var stage18 = {
  key: "value",
  title: i18n.learn.pieceValue,
  subtitle: i18n.learn.evaluatePieceStrength,
  image: imgUrl12,
  intro: i18n.learn.pieceValueIntro,
  illustration: roundSvg(imgUrl12),
  levels: [
    {
      // rook
      goal: i18n.learn.queenOverBishop,
      fen: "8/8/2qrbnp1/3P4/8/8/8/8 w - -",
      scenario: ["d5c6"],
      shapes: [arrow("d5c6")],
      success: scenarioComplete,
      failure: scenarioFailed,
      detectCapture: false
    },
    {
      goal: i18n.learn.pieceValueExchange,
      fen: "8/8/4b3/1p6/6r1/8/4Q3/8 w - -",
      scenario: ["e2e6"],
      success: scenarioComplete,
      failure: scenarioFailed,
      detectCapture: true
    },
    {
      goal: i18n.learn.pieceValueLegal,
      fen: "5b2/8/6N1/2q5/3Kn3/2rp4/3B4/8 w - -",
      scenario: ["d4e4"],
      offerIllegalMove: true,
      success: scenarioComplete,
      failure: scenarioFailed
    },
    {
      goal: i18n.learn.takeThePieceWithTheHighestValue,
      fen: "1k4q1/pp6/8/3B4/2P5/1P1p2P1/P3Kr1P/3n4 w - -",
      scenario: ["e2d1"],
      offerIllegalMove: true,
      success: scenarioComplete,
      failure: scenarioFailed,
      detectCapture: false
    },
    {
      goal: i18n.learn.takeThePieceWithTheHighestValue,
      fen: "7k/3bqp1p/7r/5N2/6K1/6n1/PPP5/R1B5 w - -",
      scenario: ["c1h6"],
      offerIllegalMove: true,
      success: scenarioComplete,
      failure: scenarioFailed
    }
  ].map((l, i) => toLevel({ ...common6, ...l }, i)),
  complete: i18n.learn.pieceValueComplete
};
var value_default = stage18;

// ../learn/src/stage/list.ts
var rawCategs = [
  {
    key: "chess-pieces",
    name: i18n.learn.chessPieces,
    stages: [rook_default, bishop_default, queen_default, king_default, knight_default, pawn_default]
  },
  {
    key: "fundamentals",
    name: i18n.learn.fundamentals,
    stages: [capture_default, protection_default, combat_default, check1_default, outOfCheck_default, checkmate1_default]
  },
  {
    key: "intermediate",
    name: i18n.learn.intermediate,
    stages: [setup_default, castling_default, enpassant_default, stalemate_default]
  },
  {
    key: "advanced",
    name: i18n.learn.advanced,
    stages: [
      value_default,
      // draw,
      // fork,
      check2_default
    ]
  }
];
var stageId = 1;
var categs = rawCategs.map((c) => ({
  ...c,
  stages: c.stages.map((s) => ({ ...s, id: stageId++ }))
}));
var stages = categs.reduce((prev, c) => prev.concat(c.stages), []);
var stagesByKey = Object.fromEntries(stages.map((s) => [s.key, s]));
var stagesById = Object.fromEntries(stages.map((s) => [s.id, s]));
var list = stages;
var byId = stagesById;
var byKey = stagesByKey;
function stageIdToCategId(stageId2) {
  const stage19 = stagesById[stageId2];
  const maybeFound = categs.findIndex((c) => c.stages.some((s) => s.key === stage19.key));
  return maybeFound !== -1 ? maybeFound : void 0;
}

// ../learn/src/run/runCtrl.ts
var RunCtrl = class {
  constructor(opts, redraw) {
    this.opts = opts;
    this.redraw = redraw;
    this.data = this.opts.storage.data;
    this.stageStarting = prop(false);
    this.stageCompleted = prop(false);
    this.initializeLevel = (restarting = false) => {
      this.levelCtrl = new LevelCtrl(
        this.withGround,
        this.stage.levels[Number(this.opts.levelId) - 1],
        {
          onCompleteImmediate: () => {
            this.opts.storage.saveScore(this.stage, this.levelCtrl.blueprint, this.levelCtrl.vm.score);
          },
          onComplete: () => {
            if (this.levelCtrl.blueprint.id < this.stage.levels.length) {
              hashNavigate(this.stage.id, this.levelCtrl.blueprint.id + 1);
            } else if (this.stageCompleted()) return;
            else {
              this.stageCompleted(true);
              stageEnd();
            }
            this.redraw();
          }
        },
        this.redraw
      );
      this.stageStarting(this.levelCtrl.blueprint.id === 1 && this.stageScore() === 0 && !restarting);
      this.stageCompleted(false);
      if (!this.opts.stageId) return;
      if (this.stageStarting()) stageStart();
      else this.levelCtrl.start();
    };
    this.setChessground = (chessground) => {
      this.chessground = chessground;
      this.withGround(this.levelCtrl.initializeWithGround);
    };
    this.pref = this.opts.pref;
    this.withGround = (f) => this.chessground ? f(this.chessground) : void 0;
    this.stageScore = () => {
      var _a, _b;
      return (_b = (_a = this.data.stages[this.stage.key]) == null ? void 0 : _a.scores.reduce((a2, b) => a2 + b)) != null ? _b : 0;
    };
    this.score = (level) => {
      var _a, _b;
      return (_b = (_a = this.data.stages[this.stage.key]) == null ? void 0 : _a.scores[level.id - 1]) != null ? _b : 0;
    };
    this.getNext = () => byId[this.stage.id + 1];
    this.hideStartingPane = () => {
      if (!this.stageStarting()) return;
      this.stageStarting(false);
      this.levelCtrl.start();
      this.redraw();
    };
    this.restart = () => {
      this.initializeLevel(true);
      this.redraw();
    };
    clearTimeouts();
    this.initializeLevel();
    pubsub.on("board.change", (is3d) => {
      this.withGround((g) => {
        g.state.addPieceZIndex = is3d;
        g.redrawAll();
      });
    });
  }
  get stage() {
    var _a;
    return byId[(_a = this.opts.stageId) != null ? _a : 1];
  }
};

// ../learn/src/sideCtrl.ts
var SideCtrl = class {
  constructor(ctrl2, opts) {
    this.reset = () => this.opts.storage.reset();
    this.activeStageId = () => this.opts.stageId || 1;
    this.getCategIdFromStageId = () => stageIdToCategId(this.activeStageId());
    this.updateCategId = () => this.categId(this.getCategIdFromStageId() || this.categId());
    this.progress = () => {
      const max = list.length * 10;
      const data = this.data.stages;
      const total = Object.keys(data).reduce((t, key) => {
        const rank = getStageRank(byKey[key], data[key].scores);
        if (rank === 1) return t + 10;
        if (rank === 2) return t + 8;
        return t + 5;
      }, 0);
      return Math.round(total / max * 100);
    };
    var _a;
    this.opts = opts;
    this.data = ctrl2.data;
    this.categId = propWithEffect((_a = this.getCategIdFromStageId()) != null ? _a : 0, ctrl2.redraw);
  }
};

// ../learn/src/ctrl.ts
var LearnCtrl = class {
  constructor(opts, redraw) {
    this.opts = opts;
    this.redraw = redraw;
    this.data = this.opts.storage.data;
    this.setStageLevelFromHash = () => {
      const { stageId: stageId2, levelId } = extractHashParameters();
      this.opts.stageId = stageId2;
      this.opts.levelId = // use the level id from the hash path if it exists
      levelId || // otherwise find a level id based on the last completed level
      (() => {
        if (!stageId2) return null;
        const stage19 = byId[stageId2];
        if (!stage19) return null;
        const result = this.data.stages[stage19.key];
        let it2 = 0;
        if (result) while (result.scores[it2]) it2++;
        if (it2 >= stage19.levels.length) it2 = 0;
        const newLevelId = it2 + 1;
        this.opts.levelId = newLevelId;
        return newLevelId;
      })() || // finally, fallback to a level id of 1
      1;
    };
    this.inStage = () => this.opts.stageId !== null;
    this.isStageIdComplete = (stageId2) => {
      const stage19 = byId[stageId2];
      if (!stage19) return true;
      const result = this.data.stages[stage19.key];
      if (!result) return false;
      return result.scores.filter(gtz).length >= stage19.levels.length;
    };
    this.stageProgress = (stage19) => {
      const result = this.data.stages[stage19.key];
      const complete = result ? result.scores.filter(gtz).length : 0;
      return [complete, stage19.levels.length];
    };
    clearTimeouts();
    this.setStageLevelFromHash();
    this.sideCtrl = new SideCtrl(this, opts);
    this.runCtrl = new RunCtrl(opts, redraw);
    window.addEventListener("hashchange", () => {
      this.setStageLevelFromHash();
      this.sideCtrl.updateCategId();
      if (this.opts.stageId !== null) this.runCtrl.initializeLevel();
      this.redraw();
    });
  }
};

// ../learn/src/storage.ts
var xhrSaveScore = (stageKey, levelId, score) => jsonAnyResponse("/learn/score", {
  method: "POST",
  body: form({
    stage: stageKey,
    level: levelId,
    score
  })
});
var xhrReset = () => jsonAnyResponse("/learn/reset", { method: "POST" });
function storage_default(d) {
  const key = "learn.progress";
  const defaultValue = {
    stages: {}
  };
  const data = d || JSON.parse(storage.get(key)) || defaultValue;
  return {
    data,
    saveScore: (stage19, level, score) => {
      if (!data.stages[stage19.key])
        data.stages[stage19.key] = {
          scores: []
        };
      if (data.stages[stage19.key].scores[level.id - 1] > score) return;
      data.stages[stage19.key].scores[level.id - 1] = score;
      data._id ? xhrSaveScore(stage19.key, level.id, score) : storage.set(key, JSON.stringify(data));
    },
    reset: () => {
      data.stages = {};
      if (data._id) xhrReset().then(() => location.reload());
      else {
        storage.remove(key);
        location.reload();
      }
    }
  };
}

// ../learn/src/mapSideView.ts
function mapSideView(ctrl2) {
  if (ctrl2.inStage()) return renderInStage(ctrl2.sideCtrl);
  else return renderHome(ctrl2.sideCtrl);
}
var helmImg = img(assetUrl + "images/learn/brutal-helm.svg", "");
function renderInStage(ctrl2) {
  return div(".learn__side-map", [
    div(".stages", [
      a(BASE_LEARN_PATH)(".back", [helmImg(), i18n.site.menu]),
      ...categs.map(
        (categ, categId) => div(".categ", { class: { active: categId === ctrl2.categId() } }, [
          h2({ hook: bind("click", () => ctrl2.categId(categId)) }, categ.name),
          div(
            ".categ_stages",
            categ.stages.map((s) => {
              const result = ctrl2.data.stages[s.key];
              const status = s.id === ctrl2.activeStageId() ? "active" : result ? "done" : "future";
              return a(hashHref(s.id))(`.stage.${status}`, [img(s.image, "")(), span(s.title)]);
            })
          )
        ])
      )
    ])
  ]);
}
function renderHome(ctrl2) {
  const progress = ctrl2.progress();
  return div(".learn__side-home", [
    div(".learn__side-home__header", [
      helmImg(".decoration"),
      div(".learn__side-home__title", [h1(i18n.learn.learnChess), h2(i18n.learn.byPlaying)])
    ]),
    div(".progress", [
      div(".text", i18n.learn.progressX(progress + "%")),
      div(".bar", { style: { width: progress + "%" } })
    ]),
    progress > 0 ? div(
      ".actions",
      button(
        ".confirm",
        {
          hook: bind("click", async () => {
            if (await confirm(i18n.learn.youWillLoseAllYourProgress)) ctrl2.reset();
          })
        },
        i18n.learn.resetMyProgress
      )
    ) : null
  ]);
}

// ../learn/src/chessground.ts
function chessground_default(ctrl2) {
  return h("div.cg-wrap", {
    hook: {
      ...onInsert((el) => {
        el.addEventListener("contextmenu", (e) => e.preventDefault());
        ctrl2.setChessground(Chessground(el, makeConfig(ctrl2)));
      }),
      destroy: () => {
        var _a;
        return (_a = ctrl2.chessground) == null ? void 0 : _a.destroy();
      }
    }
  });
}
var makeConfig = (ctrl2) => ({
  fen: "8/8/8/8/8/8/8/8",
  blockTouchScroll: true,
  coordinates: true,
  coordinatesOnSquares: ctrl2.pref.coords === Coords.All,
  jsHover: isSafari(),
  movable: { free: false, color: void 0, showDests: ctrl2.pref.destination },
  drawable: { enabled: false },
  draggable: { enabled: true },
  selectable: { enabled: true },
  addPieceZIndex: ctrl2.pref.is3d
});

// ../learn/src/progressView.ts
function makeStars(level, score) {
  const rank = getLevelRank(level, score);
  const stars = [];
  for (let i = 3; i >= rank; i--) stars.push(icon(licon.Star)());
  return span(`.stars.st${stars.length}`, stars);
}
function progressView(ctrl2) {
  return div(
    ".progress",
    ctrl2.stage.levels.map(function(level) {
      const score = ctrl2.score(level);
      const status = level.id === ctrl2.levelCtrl.blueprint.id ? "active" : score ? "done" : "future";
      const label = score ? makeStars(level, score) : span(".id", level.id);
      return a(hashHref(ctrl2.stage.id, level.id))(`.${status}`, label);
    })
  );
}

// ../learn/src/promotionView.ts
var pieces = ["queen", "knight", "rook", "bishop"];
function promotionView(ctrl2) {
  const { promotionCtrl } = ctrl2.levelCtrl;
  const { promoting } = promotionCtrl;
  const { chessground: ground } = ctrl2;
  if (!promoting || !ground) return void 0;
  const color = opposite2(ground.state.turnColor);
  const orientation = ground.state.orientation;
  const vertical = color === orientation ? "top" : "bottom";
  let left = key2pos(promoting.dest)[0] * 12.5;
  if (orientation === "black") left = 87.5 - left;
  const explain = !!ctrl2.levelCtrl.blueprint.explainPromotion;
  const bounds = ground.state.dom.bounds();
  return h(
    "div#promotion-choice." + vertical,
    {
      // a hack for now... not sure how else to fix at the moment
      style: { width: `${bounds.width}px`, height: `${bounds.height}px` }
    },
    [
      ...pieces.map(
        (role, i) => h(
          "square",
          {
            style: { [vertical]: `${i * 12.5}%`, left: `${left}%` },
            hook: bind("click", (e) => {
              e.stopPropagation();
              promotionCtrl.finish(role);
            })
          },
          h("piece." + role + "." + color)
        )
      ),
      explain ? renderExplanation() : null
    ]
  );
}
function renderExplanation() {
  return h("div.explanation", [
    h("h2", i18n.learn.pawnPromotion),
    h("p", i18n.learn.yourPawnReachedTheEndOfTheBoard),
    h("p", i18n.learn.itNowPromotesToAStrongerPiece),
    h("p", i18n.learn.selectThePieceYouWant)
  ]);
}

// ../learn/src/run/congrats.ts
var list2 = [
  i18n.learn.awesome,
  i18n.learn.excellent,
  i18n.learn.greatJob,
  i18n.learn.perfect,
  i18n.learn.outstanding,
  i18n.learn.wayToGo,
  i18n.learn.yesYesYes,
  i18n.learn.youreGoodAtThis,
  i18n.learn.nailedIt,
  i18n.learn.rightOn
];
shuffle(list2);
var it = 0;
var congrats_default = () => list2[it++ % list2.length];

// ../learn/src/run/stageComplete.ts
function makeStars2(rank) {
  const stars = [];
  for (let i = 3; i > 0; i--) stars.push(h("div.star-wrap", rank <= i ? h("icon.star") : null));
  return stars;
}
function stageComplete_default(ctrl2) {
  const stage19 = ctrl2.stage;
  const next = ctrl2.getNext();
  const score = ctrl2.stageScore();
  return h(
    "div.learn__screen-overlay",
    {
      hook: bind(
        "click",
        (e) => {
          var _a;
          return ((_a = e.target.classList) == null ? void 0 : _a.contains("learn__screen-overlay")) && hashNavigate();
        }
      )
    },
    h("div.learn__screen", [
      h("div.stars", makeStars2(getStageRank(stage19, score))),
      h("h1", i18n.learn.stageXComplete(stage19.id)),
      h(
        "span.score",
        i18n.site.yourScore.asArray(
          h(
            "span",
            {
              hook: onInsert((el) => {
                setTimeout(() => numberSpread(el, 50, 3e3, 0)(score), 300);
              })
            },
            "0"
          )
        )
      ),
      h("p", withLinebreaks(stage19.complete)),
      h("div.buttons", [
        next ? h("button.button", { hook: bind("click", () => hashNavigate(next.id)) }, [
          i18n.learn.nextX(next.title),
          icon(licon.GreaterThan)()
        ]) : null,
        h(`button.button.button-empty`, { hook: bind("click", () => hashNavigate()) }, [
          icon(licon.LessThan)(),
          i18n.learn.backToMenu
        ])
      ])
    ])
  );
}

// ../learn/src/run/stageStarting.ts
function stageStarting_default(ctrl2) {
  return h(
    "div.learn__screen-overlay",
    { hook: bind("click", ctrl2.hideStartingPane) },
    h("div.learn__screen", [
      h("h1", i18n.learn.stageX(ctrl2.stage.id) + ": " + ctrl2.stage.title),
      ctrl2.stage.illustration,
      h("p", withLinebreaks(ctrl2.stage.intro)),
      h(
        "div.buttons",
        h(
          "button.button",
          {
            key: ctrl2.stage.id,
            hook: bind("click", ctrl2.hideStartingPane)
          },
          i18n.learn.letsGo
        )
      )
    ])
  );
}

// ../learn/src/run/runView.ts
var renderFailed = (ctrl2) => div(".result.failed", { hook: bind("click", ctrl2.restart) }, [
  h2(i18n.learn.puzzleFailed),
  button(i18n.learn.retry)
]);
var renderCompleted = (level) => div(
  ".result.completed",
  {
    class: { next: !!level.blueprint.nextButton },
    hook: bind("click", level.onComplete)
  },
  [
    h2(congrats_default()),
    level.blueprint.nextButton ? button(i18n.learn.next) : makeStars(level.blueprint, level.vm.score)
  ]
);
var runView = (ctrl2) => {
  const runCtrl = ctrl2.runCtrl;
  const { stage: stage19, levelCtrl } = runCtrl;
  const rootClass = {
    starting: !!levelCtrl.vm.starting,
    completed: levelCtrl.vm.completed && !levelCtrl.blueprint.nextButton,
    "last-step": levelCtrl.vm.lastStep,
    "piece-values": !!levelCtrl.blueprint.showPieceValues
  };
  if (stage19.cssClass) rootClass[stage19.cssClass] = true;
  if (levelCtrl.blueprint.cssClass) rootClass[levelCtrl.blueprint.cssClass] = true;
  return div(".learn.learn--run", { class: rootClass }, [
    div(".learn__side", mapSideView(ctrl2)),
    div(".learn__main.main-board", { class: { apples: levelCtrl.isAppleLevel() } }, [
      runCtrl.stageStarting() ? stageStarting_default(runCtrl) : null,
      runCtrl.stageCompleted() ? stageComplete_default(runCtrl) : null,
      chessground_default(ctrl2.runCtrl),
      promotionView(ctrl2.runCtrl)
    ]),
    div(".learn__table", [
      div(".wrap", [
        div(".title", [
          img(stage19.image, "")(),
          div(".text", [h2(stage19.title), p(".subtitle", stage19.subtitle)])
        ]),
        levelCtrl.vm.failed ? renderFailed(runCtrl) : levelCtrl.vm.completed ? renderCompleted(levelCtrl) : div(".goal", withLinebreaks(levelCtrl.blueprint.goal)),
        progressView(runCtrl)
      ])
    ])
  ]);
};

// ../learn/src/view.ts
var view = (ctrl2) => ctrl2.inStage() ? runView(ctrl2) : mapView(ctrl2);
var mapView = (ctrl2) => h("div.learn.learn--map", [
  h("div.learn__side", mapSideView(ctrl2)),
  h("div.learn__main.learn-stages", [
    ...categs.map(
      (categ) => h("div.categ", [
        h("h2", categ.name),
        h(
          "div.categ_stages",
          categ.stages.map((stage19) => {
            const stageProgress = ctrl2.data.stages[stage19.key];
            const complete = ctrl2.isStageIdComplete(stage19.id);
            const prevComplete = ctrl2.isStageIdComplete(stage19.id - 1);
            const status = complete ? "done" : prevComplete || stageProgress ? "ongoing" : "future";
            const title = stage19.title;
            return h(`a.stage.${status}`, { attrs: { href: hashHref(stage19.id) } }, [
              status !== "future" ? ribbon(ctrl2, stage19, status, stageProgress) : void 0,
              h("img", { attrs: { src: stage19.image } }),
              h("div.text", [h("h3", title), h("p.subtitle", stage19.subtitle)]),
              status === "ongoing" ? h("div.attention-effect") : void 0
            ]);
          })
        )
      ])
    ),
    whatNext(ctrl2)
  ])
]);
var makeStars3 = (rank) => Array(4 - rank).fill(icon(licon.Star)());
var ongoingStr = (ctrl2, s) => {
  const progress = ctrl2.stageProgress(s);
  return progress[0] ? progress.join(" / ") : i18n.learn.play;
};
var ribbon = (ctrl2, s, status, stageProgress) => h(
  "span.ribbon-wrapper",
  h(
    `span.ribbon.${status}`,
    status === "ongoing" ? ongoingStr(ctrl2, s) : makeStars3(getStageRank(s, stageProgress.scores))
  )
);
function whatNext(ctrl2) {
  const makeStage = (href, img2, title, subtitle, done) => {
    return h(`a.stage.done`, { attrs: { href } }, [
      done ? h("span.ribbon-wrapper", h("span.ribbon.done", makeStars3(1))) : null,
      h("img", { attrs: { src: assetUrl + "images/learn/" + img2 + ".svg" } }),
      h("div.text", [h("h3", title), h("p.subtitle", subtitle)])
    ]);
  };
  const userId = ctrl2.data._id;
  return h("div.categ.what_next", [
    h("h2", i18n.learn.whatNext),
    h("p", i18n.learn.youKnowHowToPlayChess),
    h("div.categ_stages", [
      userId ? makeStage(
        "/@/" + userId,
        "beams-aura",
        i18n.learn.register,
        i18n.learn.getAFreeLichessAccount,
        true
      ) : makeStage("/signup", "beams-aura", i18n.learn.register, i18n.learn.getAFreeLichessAccount),
      makeStage("/practice", "robot-golem", i18n.learn.practice, i18n.learn.learnCommonChessPositions),
      makeStage("/training", "bullseye", i18n.learn.puzzles, i18n.learn.exerciseYourTacticalSkills),
      makeStage(
        "/video?tags=beginner",
        "tied-scroll",
        i18n.learn.videos,
        i18n.learn.watchInstructiveChessVideos
      ),
      makeStage("/#hook", "sword-clash", i18n.learn.playPeople, i18n.learn.opponentsFromAroundTheWorld),
      makeStage("/#ai", "vintage-robot", i18n.learn.playMachine, i18n.learn.testYourSkillsWithTheComputer)
    ])
  ]);
}

// ../learn/src/learn.ts
var patch = init([classModule, attributesModule, propsModule, eventListenersModule, styleModule]);
function initModule({ data, pref }) {
  const _storage = storage_default(data);
  const opts = {
    storage: _storage,
    stageId: null,
    levelId: null,
    pref
  };
  const ctrl2 = new LearnCtrl(opts, redraw);
  const element = document.getElementById("learn-app");
  element.innerHTML = "";
  const inner = document.createElement("div");
  element.appendChild(inner);
  let vnode = patch(inner, view(ctrl2));
  function redraw() {
    vnode = patch(vnode, view(ctrl2));
  }
  redraw();
  const was3d = document.head.querySelector(`link[data-css-key='lib.board-3d']`) !== null;
  pubsub.on("board.change", (is3d) => {
    if (is3d !== was3d) setTimeout(site.reload, 200);
  });
  return {};
}
export {
  initModule
};
//# sourceMappingURL=learn.DPG2CHNN.js.map
